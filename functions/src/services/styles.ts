import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { Style } from "../types/book.js";
import type { StyleConfig, StylePreset } from "../types/styleConfig.js";

export const MAX_CUSTOM_INSTRUCTION_LENGTH = 1_000;

export type BookStyleState = {
  style: Style;
  styleRevision: number;
};

export class StyleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleValidationError";
  }
}

export class StyleNotFoundError extends Error {
  constructor() {
    super("Book not found.");
    this.name = "StyleNotFoundError";
  }
}

export class StyleConflictError extends Error {
  constructor(
    public readonly style: Style,
    public readonly styleRevision: number,
  ) {
    super("The Book Style changed in another session.");
    this.name = "StyleConflictError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Style catalog ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function parseCatalogPreset(value: unknown): StylePreset {
  if (!isRecord(value) || typeof value.active !== "boolean") {
    throw new Error("Style catalog preset shape is invalid.");
  }
  return {
    id: requiredText(value.id, "preset id"),
    label: requiredText(value.label, "preset label"),
    description: requiredText(value.description, "preset description"),
    active: value.active,
  };
}

function loadCatalog(): StyleConfig {
  const configPath = fileURLToPath(new URL("../../config/style-presets.json", import.meta.url));
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.presets)) {
    throw new Error("Style catalog shape is invalid.");
  }

  const defaultPresetId = requiredText(raw.defaultPresetId, "defaultPresetId");
  const presets = raw.presets.map(parseCatalogPreset);
  const seen = new Set<string>();
  for (const preset of presets) {
    if (seen.has(preset.id)) {
      throw new Error(`Style catalog contains duplicate id: ${preset.id}`);
    }
    seen.add(preset.id);
  }
  const defaultPreset = presets.find((preset) => preset.id === defaultPresetId);
  if (!defaultPreset || !defaultPreset.active) {
    throw new Error("Style catalog default must reference an active preset.");
  }
  return { defaultPresetId, presets };
}

const STYLE_CONFIG = loadCatalog();
const PRESETS_BY_ID = new Map(STYLE_CONFIG.presets.map((preset) => [preset.id, preset]));
export const DEFAULT_STYLE_PRESET_ID = STYLE_CONFIG.defaultPresetId;

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

function cloneStyle(style: Style): Style {
  return style.customInstruction
    ? { presetIds: [...style.presetIds], customInstruction: style.customInstruction }
    : { presetIds: [...style.presetIds] };
}

function revisionOf(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function getStyleCatalog(): StyleConfig {
  return {
    defaultPresetId: STYLE_CONFIG.defaultPresetId,
    presets: STYLE_CONFIG.presets.map((preset) => ({ ...preset })),
  };
}

export function parseStyleInput(
  value: unknown,
  options: { allowInactivePresetIds?: ReadonlySet<string> } = {},
): Style {
  if (!isRecord(value) || !Array.isArray(value.presetIds)) {
    throw new StyleValidationError("Style presetIds must be an array.");
  }
  if (!value.presetIds.every((id) => typeof id === "string")) {
    throw new StyleValidationError("Every Style preset id must be a string.");
  }
  if (value.presetIds.length > 2) {
    throw new StyleValidationError("Style can contain no more than two presets.");
  }

  const presetIds = value.presetIds.map((id) => id.trim());
  if (new Set(presetIds).size !== presetIds.length) {
    throw new StyleValidationError("Style preset ids must not contain duplicates.");
  }
  for (const id of presetIds) {
    const preset = PRESETS_BY_ID.get(id);
    if (!preset) {
      throw new StyleValidationError(`Style preset id is unknown: ${id}`);
    }
    if (!preset.active && !options.allowInactivePresetIds?.has(id)) {
      throw new StyleValidationError(`Style preset is no longer selectable: ${id}`);
    }
  }

  if (value.customInstruction !== undefined && typeof value.customInstruction !== "string") {
    throw new StyleValidationError("Style customInstruction must be a string.");
  }
  if (
    typeof value.customInstruction === "string" &&
    value.customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH
  ) {
    throw new StyleValidationError(
      `Style customInstruction can contain at most ${MAX_CUSTOM_INSTRUCTION_LENGTH.toLocaleString("en-US")} characters.`,
    );
  }
  const customInstruction =
    typeof value.customInstruction === "string" ? value.customInstruction.trim() : "";

  const canonicalIds =
    presetIds.length === 0 && !customInstruction ? [STYLE_CONFIG.defaultPresetId] : presetIds;
  return customInstruction
    ? { presetIds: canonicalIds, customInstruction }
    : { presetIds: canonicalIds };
}

export function normalizeStoredStyle(value: unknown): Style {
  if (!isRecord(value)) {
    return { presetIds: [STYLE_CONFIG.defaultPresetId] };
  }
  const presetIds = Array.isArray(value.presetIds)
    ? value.presetIds
        .filter((id): id is string => typeof id === "string")
        .filter((id, index, values) => PRESETS_BY_ID.has(id) && values.indexOf(id) === index)
        .slice(0, 2)
    : [];
  const customInstruction =
    typeof value.customInstruction === "string"
      ? value.customInstruction.trim().slice(0, MAX_CUSTOM_INSTRUCTION_LENGTH)
      : "";
  const canonicalIds =
    presetIds.length === 0 && !customInstruction ? [STYLE_CONFIG.defaultPresetId] : presetIds;
  return customInstruction
    ? { presetIds: canonicalIds, customInstruction }
    : { presetIds: canonicalIds };
}

export function composeStyleInstruction(value: unknown): string {
  const style = normalizeStoredStyle(value);
  const lines = style.presetIds.map((id, index) => {
    const preset = PRESETS_BY_ID.get(id);
    return `Preset ${index + 1} - ${preset?.label ?? id}: ${preset?.description ?? ""}`;
  });
  if (style.customInstruction) {
    lines.push(`Custom instruction: ${style.customInstruction}`);
  }
  return lines.join("\n");
}

export async function getBookStyleState(bookId: string): Promise<BookStyleState | undefined> {
  const snapshot = await firestore().collection("books").doc(bookId).get();
  if (!snapshot.exists) {
    return undefined;
  }
  const data = snapshot.data();
  return {
    style: normalizeStoredStyle(data?.style),
    styleRevision: revisionOf(data?.styleRevision),
  };
}

export async function updateBookStyle(
  bookId: string,
  styleInput: unknown,
  expectedRevision: number,
): Promise<BookStyleState> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new StyleValidationError("expectedRevision must be a non-negative integer.");
  }
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bookRef);
    if (!snapshot.exists) {
      throw new StyleNotFoundError();
    }
    const data = snapshot.data();
    const styleRevision = revisionOf(data?.styleRevision);
    const currentStyle = normalizeStoredStyle(data?.style);
    if (styleRevision !== expectedRevision) {
      throw new StyleConflictError(currentStyle, styleRevision);
    }
    const inactivePresetIds = new Set(
      currentStyle.presetIds.filter((id) => PRESETS_BY_ID.get(id)?.active === false),
    );
    const style = parseStyleInput(styleInput, {
      allowInactivePresetIds: inactivePresetIds,
    });
    const result = { style: cloneStyle(style), styleRevision: styleRevision + 1 };
    transaction.update(bookRef, result);
    return result;
  });
}

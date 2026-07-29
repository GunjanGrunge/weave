import { authenticatedFetch } from "./api";
import { parseWritingProfileConfig, type WritingProfileConfig } from "./writing-profiles";

export const MAX_CUSTOM_INSTRUCTION_LENGTH = 1_000;

export type Style = {
  presetIds: string[];
  customInstruction?: string;
};

export type StylePreset = {
  id: string;
  label: string;
  description: string;
  active: boolean;
};

export type StyleConfig = {
  presets: StylePreset[];
  defaultPresetId: string;
};

export type BookStyleState = {
  style: Style;
  styleRevision: number;
};

export type StyleConfigResponse = StyleConfig &
  Partial<BookStyleState> & { writingConfig?: WritingProfileConfig };

export class StyleApiError extends Error {
  constructor(
    message: string,
    public readonly code = "request-failed",
  ) {
    super(message);
    this.name = "StyleApiError";
  }
}

export class StyleConflictError extends StyleApiError {
  constructor(
    message: string,
    public readonly canonical: BookStyleState,
  ) {
    super(message, "conflict");
    this.name = "StyleConflictError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseStyle(value: unknown): Style | undefined {
  const item = record(value);
  if (
    !item ||
    !Array.isArray(item.presetIds) ||
    item.presetIds.length > 2 ||
    !item.presetIds.every((id) => typeof id === "string" && id.length > 0 && id.trim() === id) ||
    new Set(item.presetIds).size !== item.presetIds.length ||
    (item.customInstruction !== undefined &&
      (typeof item.customInstruction !== "string" ||
        item.customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH))
  ) {
    return undefined;
  }
  return typeof item.customInstruction === "string"
    ? { presetIds: item.presetIds, customInstruction: item.customInstruction }
    : { presetIds: item.presetIds };
}

function parseBookStyleState(value: unknown, legacyRevision = false): BookStyleState | undefined {
  const item = record(value);
  const style = parseStyle(item?.style);
  const styleRevision =
    legacyRevision && item?.styleRevision === undefined ? 0 : item?.styleRevision;
  return style && Number.isSafeInteger(styleRevision) && (styleRevision as number) >= 0
    ? { style, styleRevision: styleRevision as number }
    : undefined;
}

export function parseStyleConfigResponse(value: unknown): StyleConfigResponse | undefined {
  const envelope = record(value);
  const rawConfig = record(envelope?.config);
  if (
    !rawConfig ||
    !Array.isArray(rawConfig.presets) ||
    typeof rawConfig.defaultPresetId !== "string"
  ) {
    return undefined;
  }
  const presets: StylePreset[] = [];
  const ids = new Set<string>();
  for (const valuePreset of rawConfig.presets) {
    const preset = record(valuePreset);
    if (
      !preset ||
      typeof preset.id !== "string" ||
      !preset.id ||
      typeof preset.label !== "string" ||
      !preset.label ||
      typeof preset.description !== "string" ||
      !preset.description ||
      typeof preset.active !== "boolean" ||
      ids.has(preset.id)
    ) {
      return undefined;
    }
    ids.add(preset.id);
    presets.push({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      active: preset.active,
    });
  }
  if (!presets.some((preset) => preset.id === rawConfig.defaultPresetId && preset.active)) {
    return undefined;
  }

  const config: StyleConfig = { presets, defaultPresetId: rawConfig.defaultPresetId };
  const writingConfig =
    envelope?.writingConfig === undefined
      ? undefined
      : parseWritingProfileConfig(envelope.writingConfig);
  if (envelope?.writingConfig !== undefined && !writingConfig) {
    return undefined;
  }
  if (envelope?.style === undefined && envelope?.styleRevision === undefined) {
    return { ...config, ...(writingConfig ? { writingConfig } : {}) };
  }
  const state = parseBookStyleState(envelope, true);
  return state && state.style.presetIds.every((id) => ids.has(id))
    ? { ...config, ...state, ...(writingConfig ? { writingConfig } : {}) }
    : undefined;
}

export function styleCatalogQueryKey(uid: string | undefined) {
  return ["style-config", uid, "catalog"] as const;
}

export function bookStyleQueryKey(uid: string | undefined, bookId: string) {
  return ["style-config", uid, bookId] as const;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new StyleApiError("The server returned an unreadable response.");
  }
}

function messageFrom(value: unknown, fallback: string): string {
  const item = record(value);
  return typeof item?.message === "string" ? item.message : fallback;
}

export async function fetchStyleConfig(bookId?: string): Promise<StyleConfigResponse> {
  const response = await authenticatedFetch("/getStyleConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookId ? { bookId } : {}),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new StyleApiError(messageFrom(body, "Could not load style options."));
  }
  const parsed = parseStyleConfigResponse(body);
  if (!parsed) {
    throw new StyleApiError("The server returned invalid style data.");
  }
  return parsed;
}

export async function updateBookStyle(
  bookId: string,
  style: Style,
  expectedRevision: number,
): Promise<BookStyleState> {
  const response = await authenticatedFetch("/updateBookStyle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, style, expectedRevision }),
  });
  const body = await readJson(response);
  if (response.status === 409) {
    const canonical = parseBookStyleState(body);
    if (!canonical) {
      throw new StyleApiError("The server returned an invalid conflict response.");
    }
    throw new StyleConflictError(
      messageFrom(body, "The Book Style changed in another session."),
      canonical,
    );
  }
  if (!response.ok) {
    throw new StyleApiError(messageFrom(body, "Could not save the Book Style."));
  }
  const parsed = parseBookStyleState(body);
  if (!parsed) {
    throw new StyleApiError("The server returned invalid saved style data.");
  }
  return parsed;
}

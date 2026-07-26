import { GoogleGenAI } from "@google/genai";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { ModelRegistry } from "../types/modelRegistry.js";
import type { VisionDocument } from "../types/vision.js";

export class GeminiError extends Error {
  code: "gemini-error";

  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
    this.code = "gemini-error";
  }
}

export type OpeningSuggestion = { text: string; rationale: string };

const OPENING_SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["text", "rationale"],
      },
    },
  },
  required: ["openings"],
};

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

// Cached per warm Cloud Functions instance; re-read on cold start so a
// registry update takes effect on the next deploy/instance cycle rather
// than never (AD-9 model registry).
let cachedRegistry: ModelRegistry | undefined;

export async function readModelRegistry(): Promise<ModelRegistry> {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const snapshot = await firestore().collection("config").doc("geminiModels").get();
  if (!snapshot.exists) {
    throw new GeminiError("Model registry doc config/geminiModels does not exist.");
  }

  cachedRegistry = snapshot.data() as ModelRegistry;
  return cachedRegistry;
}

function buildOpeningSuggestionPrompt(vision: VisionDocument): string {
  const characterIntents =
    vision.characterIntents.length > 0 ? vision.characterIntents.join(", ") : "(not specified)";

  return [
    "You are helping a novelist choose how to open their book.",
    `Theme/what they want to write: ${vision.theme || "(not specified)"}`,
    `Premise: ${vision.premise || "(not specified)"}`,
    `Character intents: ${characterIntents}`,
    "Suggest 2 to 3 concrete, distinct ways this book could open as its first scene.",
    "For each, give a one-line rationale for why it works as an opening.",
    'Respond as JSON: { "openings": [ { "text": "...", "rationale": "..." } ] }.',
  ].join("\n");
}

function parseOpenings(responseText: string | undefined): OpeningSuggestion[] {
  if (!responseText) {
    throw new GeminiError("Gemini response had no text content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GeminiError("Gemini response was not valid JSON.");
  }

  const openings = (parsed as { openings?: unknown }).openings;
  if (!Array.isArray(openings)) {
    throw new GeminiError("Gemini response did not contain an openings array.");
  }

  const valid = openings.filter(
    (item): item is OpeningSuggestion =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as OpeningSuggestion).text === "string" &&
      typeof (item as OpeningSuggestion).rationale === "string",
  );

  if (valid.length < 2) {
    throw new GeminiError("Gemini response did not contain at least 2 valid openings.");
  }

  return valid.slice(0, 3);
}

async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ openings: OpeningSuggestion[]; model: string; inputTokens: number; outputTokens: number }> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseSchema: OPENING_SUGGESTION_SCHEMA,
      responseMimeType: "application/json",
    },
  });

  const openings = parseOpenings(response.text);
  const usage = response.usageMetadata;

  return {
    openings,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

async function recordUsage(
  bookId: string,
  task: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await firestore().collection("books").doc(bookId).collection("usage").doc().set({
    task,
    model,
    inputTokens,
    outputTokens,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function generateOpeningSuggestions(
  bookId: string,
  vision: VisionDocument,
  apiKey: string,
): Promise<{ openings: OpeningSuggestion[] }> {
  const registry = await readModelRegistry();
  const prompt = buildOpeningSuggestionPrompt(vision);

  let result: Awaited<ReturnType<typeof callModel>>;
  try {
    result = await callModel(apiKey, registry.openingSuggestion.model, prompt);
  } catch {
    try {
      result = await callModel(apiKey, registry.openingSuggestion.fallback, prompt);
    } catch (fallbackError) {
      if (fallbackError instanceof GeminiError) {
        throw fallbackError;
      }
      throw new GeminiError("Both the primary and fallback Gemini calls failed.");
    }
  }

  await recordUsage(bookId, "openingSuggestion", result.model, result.inputTokens, result.outputTokens);

  return { openings: result.openings };
}

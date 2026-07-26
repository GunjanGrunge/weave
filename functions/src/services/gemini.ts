import { GoogleGenAI } from "@google/genai";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { ModelRegistry, TextModelConfig } from "../types/modelRegistry.js";
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
export type AIProviderKeys = { openai: string; gemini: string };

const OPENING_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    openings: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
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

function parseOpenings(responseText: string | undefined, provider = "AI"): OpeningSuggestion[] {
  if (!responseText) {
    throw new GeminiError(`${provider} response had no text content.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GeminiError(`${provider} response was not valid JSON.`);
  }

  const openings = (parsed as { openings?: unknown }).openings;
  if (!Array.isArray(openings)) {
    throw new GeminiError(`${provider} response did not contain an openings array.`);
  }

  const valid = openings.filter(
    (item): item is OpeningSuggestion =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as OpeningSuggestion).text === "string" &&
      typeof (item as OpeningSuggestion).rationale === "string",
  );

  if (valid.length < 2) {
    throw new GeminiError(`${provider} response did not contain at least 2 valid openings.`);
  }

  return valid.slice(0, 3);
}

type ModelCallResult = {
  openings: OpeningSuggestion[];
  provider: "openai" | "gemini";
  model: string;
  inputTokens: number;
  outputTokens: number;
};

function extractOpenAIText(response: unknown): string | undefined {
  if (typeof (response as { output_text?: unknown }).output_text === "string") {
    return (response as { output_text: string }).output_text;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return undefined;
}

async function callOpenAIModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<ModelCallResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "opening_suggestions",
          schema: OPENING_SUGGESTION_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new GeminiError(`OpenAI call failed with status ${response.status}.`);
  }

  const body = (await response.json()) as {
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  return {
    openings: parseOpenings(extractOpenAIText(body), "OpenAI"),
    provider: "openai",
    model,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

async function callGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<ModelCallResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseSchema: OPENING_SUGGESTION_SCHEMA,
      responseMimeType: "application/json",
    },
  });

  const openings = parseOpenings(response.text, "Gemini");
  const usage = response.usageMetadata;

  return {
    openings,
    provider: "gemini",
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

async function recordUsage(
  bookId: string,
  task: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await firestore().collection("books").doc(bookId).collection("usage").doc().set({
    task,
    provider,
    model,
    inputTokens,
    outputTokens,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function callConfiguredModel(
  modelConfig: TextModelConfig["primary"],
  keys: AIProviderKeys,
  prompt: string,
): Promise<ModelCallResult> {
  if (modelConfig.provider === "openai") {
    return callOpenAIModel(keys.openai, modelConfig.model, prompt);
  }
  return callGeminiModel(keys.gemini, modelConfig.model, prompt);
}

export async function generateOpeningSuggestions(
  bookId: string,
  vision: VisionDocument,
  apiKeys: AIProviderKeys,
): Promise<{ openings: OpeningSuggestion[] }> {
  const registry = await readModelRegistry();
  const prompt = buildOpeningSuggestionPrompt(vision);
  const modelConfig = registry.openingSuggestion;

  let result: ModelCallResult;
  try {
    result = await callConfiguredModel(modelConfig.primary, apiKeys, prompt);
  } catch (primaryError) {
    if (!modelConfig.fallback) {
      if (primaryError instanceof GeminiError) {
        throw primaryError;
      }
      throw new GeminiError("Primary AI call failed and no fallback is configured.");
    }
    try {
      result = await callConfiguredModel(modelConfig.fallback, apiKeys, prompt);
    } catch (fallbackError) {
      if (fallbackError instanceof GeminiError) {
        throw fallbackError;
      }
      throw new GeminiError("Both the primary and fallback AI calls failed.");
    }
  }

  await recordUsage(
    bookId,
    "openingSuggestion",
    result.provider,
    result.model,
    result.inputTokens,
    result.outputTokens,
  );

  return { openings: result.openings };
}

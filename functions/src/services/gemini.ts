import { GoogleGenAI } from "@google/genai";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { ModelRegistry, TextModelConfig } from "../types/modelRegistry.js";
import type { UsageTask } from "../types/usage.js";
import type { VisionDocument } from "../types/vision.js";
import { composeWritingProfileInstruction } from "./writingProfiles.js";

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
    "You are an accomplished novelist helping another writer choose how to open their book.",
    composeWritingProfileInstruction(vision),
    `Theme/what they want to write: ${vision.theme || "(not specified)"}`,
    `Premise: ${vision.premise || "(not specified)"}`,
    `Character intents: ${characterIntents}`,
    "Suggest 2 to 3 concrete, distinct ways this book could open as its first scene. Each opening must honor the genre promises and book voice without relying on genre clichés.",
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

type RawModelCallResult = {
  text: string | undefined;
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

async function callOpenAIRaw(
  apiKey: string,
  model: string,
  prompt: string,
  schema?: { name: string; schema: object },
): Promise<RawModelCallResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      ...(schema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: schema.name,
                schema: schema.schema,
                strict: true,
              },
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new GeminiError(`OpenAI call failed with status ${response.status}.`);
  }

  const body = (await response.json()) as {
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  return {
    text: extractOpenAIText(body),
    provider: "openai",
    model,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}

async function callGeminiRaw(
  apiKey: string,
  model: string,
  prompt: string,
  schema?: object,
): Promise<RawModelCallResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    ...(schema ? { config: { responseSchema: schema, responseMimeType: "application/json" } } : {}),
  });

  const usage = response.usageMetadata;

  return {
    text: response.text,
    provider: "gemini",
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

async function recordUsage(
  bookId: string,
  task: UsageTask,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const safeInputTokens = Number.isFinite(inputTokens) && inputTokens >= 0 ? inputTokens : 0;
  const safeOutputTokens = Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : 0;
  const usage = firestore().collection("books").doc(bookId).collection("usage");
  await usage.doc().set({
    task,
    provider,
    model,
    inputTokens: safeInputTokens,
    outputTokens: safeOutputTokens,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function recordUsageBestEffort(
  bookId: string,
  task: UsageTask,
  result: RawModelCallResult,
): Promise<void> {
  try {
    await recordUsage(
      bookId,
      task,
      result.provider,
      result.model,
      result.inputTokens,
      result.outputTokens,
    );
  } catch (error) {
    console.error("usage/record: provider response could not be logged", {
      bookId,
      task,
      error,
    });
  }
}

async function callConfiguredModelRaw(
  modelConfig: TextModelConfig["primary"],
  keys: AIProviderKeys,
  prompt: string,
  schema?: { name: string; schema: object },
): Promise<RawModelCallResult> {
  if (modelConfig.provider === "openai") {
    return callOpenAIRaw(keys.openai, modelConfig.model, prompt, schema);
  }
  return callGeminiRaw(keys.gemini, modelConfig.model, prompt, schema?.schema);
}

export async function callWithFallback(
  modelConfig: TextModelConfig,
  keys: AIProviderKeys,
  prompt: string,
  schema?: { name: string; schema: object },
): Promise<RawModelCallResult> {
  try {
    return await callConfiguredModelRaw(modelConfig.primary, keys, prompt, schema);
  } catch (primaryError) {
    if (!modelConfig.fallback) {
      if (primaryError instanceof GeminiError) {
        throw primaryError;
      }
      throw new GeminiError("Primary AI call failed and no fallback is configured.");
    }
    try {
      return await callConfiguredModelRaw(modelConfig.fallback, keys, prompt, schema);
    } catch (fallbackError) {
      if (fallbackError instanceof GeminiError) {
        throw fallbackError;
      }
      throw new GeminiError("Both the primary and fallback AI calls failed.");
    }
  }
}

export async function generateOpeningSuggestions(
  bookId: string,
  vision: VisionDocument,
  apiKeys: AIProviderKeys,
): Promise<{ openings: OpeningSuggestion[] }> {
  const registry = await readModelRegistry();
  const prompt = buildOpeningSuggestionPrompt(vision);

  const result = await callWithFallback(registry.openingSuggestion, apiKeys, prompt, {
    name: "opening_suggestions",
    schema: OPENING_SUGGESTION_SCHEMA,
  });

  await recordUsageBestEffort(bookId, "openingSuggestion", result);
  const openings = parseOpenings(result.text, result.provider === "openai" ? "OpenAI" : "Gemini");

  return { openings };
}

export async function generateScene(
  bookId: string,
  prompt: string,
  apiKeys: AIProviderKeys,
  task: UsageTask = "generate",
): Promise<{ text: string; provider: "openai" | "gemini"; model: string }> {
  const registry = await readModelRegistry();
  const result = await callWithFallback(registry.generate, apiKeys, prompt);
  await recordUsageBestEffort(bookId, task, result);

  if (!result.text) {
    throw new GeminiError(
      `${result.provider === "openai" ? "OpenAI" : "Gemini"} response had no text content.`,
    );
  }

  return { text: result.text, provider: result.provider, model: result.model };
}

export async function reviseSceneDraft(
  bookId: string,
  originalPrompt: string,
  draft: string,
  apiKeys: AIProviderKeys,
): Promise<{ text: string; provider: "openai" | "gemini"; model: string }> {
  const registry = await readModelRegistry();
  const prompt = [
    "You are the final literary editor for a novel scene.",
    "Perform a substantive but faithful revision of the draft against the complete writing brief.",
    "Strengthen scene embodiment, causality, emotional movement, character specificity, rhythm, imagery, dialogue, genre execution, and continuity.",
    "Remove clichés, repetition, filler, generic AI phrasing, over-explanation, and ornamental language that does not serve the scene.",
    "Preserve all requested events, established facts, point of view, tense, and author intent. Do not add commentary.",
    "Return only the complete revised manuscript scene.",
    "",
    "BEGIN WRITING BRIEF",
    originalPrompt,
    "END WRITING BRIEF",
    "",
    "BEGIN DRAFT",
    draft,
    "END DRAFT",
  ].join("\n");
  const result = await callWithFallback(registry.generate, apiKeys, prompt);
  await recordUsageBestEffort(bookId, "deepRevision", result);
  if (!result.text) {
    throw new GeminiError("Deep revision response had no text content.");
  }
  return { text: result.text, provider: result.provider, model: result.model };
}

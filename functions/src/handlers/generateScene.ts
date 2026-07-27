import { onRequest } from "firebase-functions/v2/https";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runGenerate } from "../pipelines/generate.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { appendChatMessage, getBook } from "../services/books.js";
import type { AIProviderKeys } from "../services/gemini.js";
import type { SceneInput, StructuredSceneFields } from "../types/sceneInput.js";

const GENERATE_SCENE_TIMEOUT_MS = 55_000;
// Cap for the free-text description — prompt size/cost/latency budget.
const MAX_DESCRIPTION_LENGTH = 4_000;
// Structured fields are short quick-fill phrases, not paragraphs — a much
// smaller per-field cap than the free-text budget. With 4 fields this bounds
// worst-case combined structured input to 2,000 chars, half of free-text's
// 4,000, closing the gap where 4 fields at the old shared 4,000-char cap
// could smuggle ~4x the prompt volume free-text allows (the exact class of
// timeout risk Story 2.1's live verification found with an oversized prompt).
const MAX_STRUCTURED_FIELD_LENGTH = 500;

export type GenerateSceneSuccess = {
  sessionId: string;
  text: string;
  provider: "openai" | "gemini";
  model: string;
};
export type GenerateSceneError = { code: string; message: string };

export type GenerateSceneResult =
  | { statusCode: 200; body: GenerateSceneSuccess }
  | { statusCode: 400; body: GenerateSceneError }
  | { statusCode: 401; body: GenerateSceneError }
  | { statusCode: 404; body: GenerateSceneError }
  | { statusCode: 502; body: GenerateSceneError };

const STRUCTURED_FIELD_KEYS = ["sceneGoal", "mood", "povCharacter", "setting"] as const;

function parseStructuredFields(rawFields: unknown): StructuredSceneFields | undefined {
  if (typeof rawFields !== "object" || rawFields === null) {
    return undefined;
  }
  const record = rawFields as Record<string, unknown>;
  const fields: StructuredSceneFields = {};

  for (const key of STRUCTURED_FIELD_KEYS) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > MAX_STRUCTURED_FIELD_LENGTH) {
      return undefined;
    }
    fields[key] = trimmed;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function parseInput(body: unknown): { bookId: string; input: SceneInput } | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const bookId = record.bookId;
  if (typeof bookId !== "string" || bookId.length === 0) {
    return undefined;
  }

  if (record.mode === "structured") {
    const fields = parseStructuredFields(record.fields);
    if (!fields) {
      return undefined;
    }
    return { bookId, input: { mode: "structured", fields } };
  }

  const description = record.description;
  if (
    typeof description !== "string" ||
    description.trim().length === 0 ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return undefined;
  }
  return { bookId, input: { mode: "free-text", description } };
}

function summarizeSceneInput(input: SceneInput): string {
  if (input.mode === "free-text") {
    return input.description;
  }

  const labels: Record<keyof StructuredSceneFields, string> = {
    sceneGoal: "Scene goal",
    mood: "Mood",
    povCharacter: "POV/character",
    setting: "Setting",
  };

  return STRUCTURED_FIELD_KEYS.filter((key) => input.fields[key])
    .map((key) => `${labels[key]}: ${input.fields[key]}.`)
    .join(" ");
}

function runGenerateWithTimeout(
  bookId: string,
  input: SceneInput,
  apiKeys: AIProviderKeys,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof runGenerate>>> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: "failed" }), timeoutMs);

    runGenerate(bookId, input, apiKeys)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        console.error("generateScene: runGenerate rejected", { bookId, error });
        clearTimeout(timeout);
        resolve({ status: "failed" });
      });
  });
}

export async function buildGenerateSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
  timeoutMs = GENERATE_SCENE_TIMEOUT_MS,
): Promise<GenerateSceneResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const parsed = parseInput(body);
    if (!parsed) {
      return {
        statusCode: 400,
        body: {
          code: "invalid-argument",
          message:
            "Request body must include a bookId and either a non-empty description or at least one structured field.",
        },
      };
    }

    const book = await getBook(parsed.bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const result = await runGenerateWithTimeout(parsed.bookId, parsed.input, apiKeys, timeoutMs);
    if (result.status !== "ok") {
      return {
        statusCode: 502,
        body: { code: "generation-failed", message: "Scene generation failed or timed out." },
      };
    }

    // The generation already succeeded and was billed at this point — a
    // Firestore write failure here must not discard it from the response,
    // only fail to persist it to chat history.
    try {
      await appendChatMessage(parsed.bookId, "user", summarizeSceneInput(parsed.input));
      await appendChatMessage(parsed.bookId, "assistant_scene", result.text);
    } catch (error) {
      console.error("generateScene: appendChatMessage failed after a successful generation", {
        bookId: parsed.bookId,
        error,
      });
    }

    return {
      statusCode: 200,
      body: {
        sessionId: result.sessionId,
        text: result.text,
        provider: result.provider,
        model: result.model,
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const generateScene = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildGenerateSceneResponse(request.headers.authorization, request.body, {
        gemini: GOOGLE_API_KEY.value(),
        openai: OPENAI_API_KEY.value(),
      });
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

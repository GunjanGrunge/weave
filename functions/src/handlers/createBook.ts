import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runIntakeOpeningSuggestion } from "../pipelines/intake.js";
import { verifyIdToken, AuthError } from "../services/auth.js";
import { createBookWithIntake, type CreateBookInput } from "../services/books.js";
import type { AIProviderKeys, OpeningSuggestion } from "../services/gemini.js";

const OPENING_SUGGESTION_TIMEOUT_MS = 12_000;

export type CreateBookSuccess = {
  bookId: string;
  openingSuggestion: "ok" | "failed";
  openings: OpeningSuggestion[];
};
export type CreateBookError = { code: string; message: string };

export type CreateBookResult =
  | { statusCode: 200; body: CreateBookSuccess }
  | { statusCode: 400; body: CreateBookError }
  | { statusCode: 401; body: CreateBookError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCreateBookInput(body: unknown): CreateBookInput | undefined {
  if (!isRecord(body) || !isRecord(body.premiseAnswers) || !isRecord(body.style)) {
    return undefined;
  }
  const rawPresetIds = body.style.presetIds;
  if (!Array.isArray(rawPresetIds) || !rawPresetIds.every((id) => typeof id === "string")) {
    return undefined;
  }

  return {
    premiseAnswers: {
      whatToWrite:
        typeof body.premiseAnswers.whatToWrite === "string"
          ? body.premiseAnswers.whatToWrite
          : undefined,
      mainCharacter:
        typeof body.premiseAnswers.mainCharacter === "string"
          ? body.premiseAnswers.mainCharacter
          : undefined,
      roughPremise:
        typeof body.premiseAnswers.roughPremise === "string"
          ? body.premiseAnswers.roughPremise
          : undefined,
    },
    style: {
      presetIds: rawPresetIds,
      customInstruction:
        typeof body.style.customInstruction === "string" ? body.style.customInstruction : undefined,
    },
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  };
}

function runOpeningSuggestionWithTimeout(
  bookId: string,
  apiKeys: AIProviderKeys,
  timeoutMs: number,
): Promise<{ status: "ok" | "failed"; openings: OpeningSuggestion[] }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: "failed", openings: [] }), timeoutMs);

    runIntakeOpeningSuggestion(bookId, apiKeys)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve({ status: "failed", openings: [] });
      });
  });
}

export async function buildCreateBookResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
  openingSuggestionTimeoutMs = OPENING_SUGGESTION_TIMEOUT_MS,
): Promise<CreateBookResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const input = parseCreateBookInput(body);
    if (!input) {
      return {
        statusCode: 400,
        body: {
          code: "invalid-argument",
          message: "Request body must be a valid book intake payload.",
        },
      };
    }

    const { bookId } = await createBookWithIntake(decoded.uid, input);
    const openingSuggestion = await runOpeningSuggestionWithTimeout(
      bookId,
      apiKeys,
      openingSuggestionTimeoutMs,
    );

    return {
      statusCode: 200,
      body: { bookId, openingSuggestion: openingSuggestion.status, openings: openingSuggestion.openings },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const createBook = onRequest(
  {
    cors: allowedOrigins(),
    region: "us-central1",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildCreateBookResponse(
        request.headers.authorization,
        request.body,
        { gemini: GOOGLE_API_KEY.value(), openai: OPENAI_API_KEY.value() },
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

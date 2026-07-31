import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { verifyIdToken, AuthError } from "../services/auth.js";
import { createBookWithIntake, type CreateBookInput } from "../services/books.js";
import type { AIProviderKeys } from "../services/gemini.js";
import { parseStyleInput, StyleValidationError } from "../services/styles.js";
import {
  parseGenreProfile,
  parseVoiceProfile,
  WritingProfileValidationError,
} from "../services/writingProfiles.js";

export type CreateBookSuccess = {
  bookId: string;
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
    style: parseStyleInput(body.style),
    genreProfile:
      body.genreProfile === undefined ? undefined : parseGenreProfile(body.genreProfile),
    voiceProfile:
      body.voiceProfile === undefined ? undefined : parseVoiceProfile(body.voiceProfile),
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  };
}

export async function buildCreateBookResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  _apiKeys: AIProviderKeys,
  _legacyOpeningSuggestionTimeoutMs?: number,
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
    return { statusCode: 200, body: { bookId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof StyleValidationError || error instanceof WritingProfileValidationError) {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: error.message },
      };
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
      const result = await buildCreateBookResponse(request.headers.authorization, request.body, {
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

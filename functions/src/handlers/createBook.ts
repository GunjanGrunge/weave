import { onRequest } from "firebase-functions/v2/https";

import { verifyIdToken, AuthError } from "../services/auth.js";
import { createBookWithIntake, type CreateBookInput } from "../services/books.js";

export type CreateBookSuccess = { bookId: string };
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
  };
}

export async function buildCreateBookResponse(
  authorizationHeader: string | undefined,
  body: unknown,
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

    return { statusCode: 200, body: await createBookWithIntake(decoded.uid, input) };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const createBook = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
  },
  async (request, response) => {
    try {
      const result = await buildCreateBookResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

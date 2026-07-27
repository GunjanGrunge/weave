import { randomUUID } from "crypto";

import { onRequest } from "firebase-functions/v2/https";

import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook, updateVisionDocument, type VisionUpdatePatch } from "../services/books.js";
import type {
  NarrativeThread,
  ThreadStatus,
  ThreadSubtlety,
  VisionDocument,
} from "../types/vision.js";

const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 2_000;
const MAX_INTENTS = 20;
const MAX_THREADS = 50;
const SUBTLETIES = new Set<ThreadSubtlety>(["invisible", "subtle", "explicit"]);
const STATUSES = new Set<ThreadStatus>(["open", "paid_off"]);

export type UpdateVisionSuccess = { vision: VisionDocument };
export type UpdateVisionError = { code: string; message: string };

export type UpdateVisionResult =
  | { statusCode: 200; body: UpdateVisionSuccess }
  | { statusCode: 400; body: UpdateVisionError }
  | { statusCode: 401; body: UpdateVisionError }
  | { statusCode: 404; body: UpdateVisionError };

class ValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string.`);
  }
  return value.trim().slice(0, maxLength);
}

function parseCharacterIntents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("characterIntents must be an array.");
  }
  return value
    .map((item) => cleanString(item, "characterIntent", MAX_SHORT_TEXT))
    .filter(Boolean)
    .slice(0, MAX_INTENTS);
}

function parseThread(value: unknown): NarrativeThread {
  if (!isRecord(value)) {
    throw new ValidationError("Each thread must be an object.");
  }

  const subtlety = value.subtlety;
  if (typeof subtlety !== "string" || !SUBTLETIES.has(subtlety as ThreadSubtlety)) {
    throw new ValidationError("Thread subtlety is invalid.");
  }

  const status = value.status ?? "open";
  if (typeof status !== "string" || !STATUSES.has(status as ThreadStatus)) {
    throw new ValidationError("Thread status is invalid.");
  }

  const rawAppearances = value.appearances;
  const appearances = Array.isArray(rawAppearances)
    ? rawAppearances
        .map((appearance) => cleanString(appearance, "appearance", MAX_SHORT_TEXT))
        .filter(Boolean)
    : [];

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id.trim().slice(0, MAX_SHORT_TEXT)
        : randomUUID(),
    surface: cleanString(value.surface, "surface", MAX_LONG_TEXT),
    meaning: cleanString(value.meaning, "meaning", MAX_LONG_TEXT),
    subtlety: subtlety as ThreadSubtlety,
    payoffIntent: cleanString(value.payoffIntent, "payoffIntent", MAX_LONG_TEXT),
    status: status as ThreadStatus,
    appearances,
  };
}

function parseVisionPatch(body: unknown): { bookId: string; patch: VisionUpdatePatch } {
  if (!isRecord(body) || typeof body.bookId !== "string" || !isRecord(body.vision)) {
    throw new ValidationError("Request body must include bookId and vision.");
  }

  const threads = body.vision.threads;
  if (!Array.isArray(threads)) {
    throw new ValidationError("threads must be an array.");
  }

  return {
    bookId: body.bookId,
    patch: {
      theme: cleanString(body.vision.theme, "theme", MAX_SHORT_TEXT),
      premise: cleanString(body.vision.premise, "premise", MAX_LONG_TEXT),
      characterIntents: parseCharacterIntents(body.vision.characterIntents),
      threads: threads.map(parseThread).slice(0, MAX_THREADS),
    },
  };
}

export async function buildUpdateVisionResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<UpdateVisionResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const { bookId, patch } = parseVisionPatch(body);

    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const vision = await updateVisionDocument(bookId, patch);
    if (!vision) {
      return { statusCode: 404, body: { code: "not-found", message: "Vision document not found." } };
    }

    return { statusCode: 200, body: { vision } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof ValidationError) {
      return { statusCode: 400, body: { code: "invalid-argument", message: error.message } };
    }
    throw error;
  }
}

export const updateVision = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
  },
  async (request, response) => {
    try {
      const result = await buildUpdateVisionResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

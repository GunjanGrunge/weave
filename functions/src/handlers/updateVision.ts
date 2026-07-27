import { randomUUID } from "crypto";

import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
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
    // The frontend round-trips intents as one-per-line text; an embedded
    // newline would silently split into two entries on the next save.
    .map((item) => item.replace(/\s*\n\s*/g, " ").trim())
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

  const surface = cleanString(value.surface, "surface", MAX_LONG_TEXT);
  const meaning = cleanString(value.meaning, "meaning", MAX_LONG_TEXT);
  const payoffIntent = cleanString(value.payoffIntent, "payoffIntent", MAX_LONG_TEXT);
  if (!surface || !meaning || !payoffIntent) {
    throw new ValidationError("Thread surface, meaning, and payoffIntent must not be blank.");
  }

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id.trim().slice(0, MAX_SHORT_TEXT)
        : randomUUID(),
    surface,
    meaning,
    subtlety: subtlety as ThreadSubtlety,
    payoffIntent,
    status: status as ThreadStatus,
    // appearances is system-owned (Epic 3 scene/Muse work) — the service
    // layer always overwrites this with the stored value for the thread's
    // id, so whatever the client sends here is never trusted.
    appearances: [],
  };
}

function parseBookId(body: unknown): string {
  if (!isRecord(body) || typeof body.bookId !== "string" || body.bookId.length === 0) {
    throw new ValidationError("Request body must include bookId and vision.");
  }
  return body.bookId;
}

function parseVisionFields(body: unknown): VisionUpdatePatch {
  // parseBookId already confirmed body is a record with a bookId; re-check
  // shape defensively rather than trusting the caller passed the same body.
  if (!isRecord(body) || !isRecord(body.vision)) {
    throw new ValidationError("Request body must include bookId and vision.");
  }

  const threads = body.vision.threads;
  if (!Array.isArray(threads)) {
    throw new ValidationError("threads must be an array.");
  }

  const parsedThreads = threads.map(parseThread).slice(0, MAX_THREADS);
  const seenIds = new Set<string>();
  for (const thread of parsedThreads) {
    if (seenIds.has(thread.id)) {
      throw new ValidationError("Thread ids must be unique.");
    }
    seenIds.add(thread.id);
  }

  return {
    theme: cleanString(body.vision.theme, "theme", MAX_SHORT_TEXT),
    premise: cleanString(body.vision.premise, "premise", MAX_LONG_TEXT),
    characterIntents: parseCharacterIntents(body.vision.characterIntents),
    threads: parsedThreads,
  };
}

export async function buildUpdateVisionResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<UpdateVisionResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const bookId = parseBookId(body);

    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const patch = parseVisionFields(body);
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
    cors: allowedOrigins(),
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

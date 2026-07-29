import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import { getBookStyleState, getStyleCatalog } from "../services/styles.js";
import type { BookStyleState } from "../services/styles.js";
import type { StyleConfig } from "../types/styleConfig.js";
import { getWritingProfileConfig, type WritingProfileConfig } from "../services/writingProfiles.js";

type StyleConfigSuccess = {
  config: StyleConfig;
  writingConfig: WritingProfileConfig;
} & Partial<BookStyleState>;
type StyleConfigError = { code: string; message: string };
export type GetStyleConfigResult =
  | { statusCode: 200; body: StyleConfigSuccess }
  | { statusCode: 400 | 401 | 404; body: StyleConfigError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalBookId(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (!isRecord(body)) {
    throw new Error("invalid-body");
  }
  if (body.bookId === undefined) {
    return undefined;
  }
  if (typeof body.bookId !== "string" || !body.bookId.trim()) {
    throw new Error("invalid-book-id");
  }
  return body.bookId.trim();
}

export async function buildGetStyleConfigResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<GetStyleConfigResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    let bookId: string | undefined;
    try {
      bookId = parseOptionalBookId(body);
    } catch {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: "bookId must be a non-empty string." },
      };
    }

    const config = getStyleCatalog();
    const writingConfig = getWritingProfileConfig();
    if (!bookId) {
      return { statusCode: 200, body: { config, writingConfig } };
    }

    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);
    const state = await getBookStyleState(bookId);
    if (!state) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    return { statusCode: 200, body: { config, writingConfig, ...state } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const getStyleConfig = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildGetStyleConfigResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

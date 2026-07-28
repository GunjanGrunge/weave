import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import {
  StyleConflictError,
  StyleNotFoundError,
  StyleValidationError,
  updateBookStyle as persistBookStyle,
} from "../services/styles.js";
import type { BookStyleState } from "../services/styles.js";
import type { Style } from "../types/book.js";

type UpdateStyleError = {
  code: string;
  message: string;
  style?: Style;
  styleRevision?: number;
};
export type UpdateBookStyleResult =
  | { statusCode: 200; body: BookStyleState }
  | { statusCode: 400 | 401 | 404 | 409; body: UpdateStyleError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(body: unknown): {
  bookId: string;
  style: unknown;
  expectedRevision: number;
} {
  if (
    !isRecord(body) ||
    typeof body.bookId !== "string" ||
    !body.bookId.trim() ||
    !isRecord(body.style) ||
    typeof body.expectedRevision !== "number" ||
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 0
  ) {
    throw new StyleValidationError(
      "Request must include bookId, style, and a non-negative expectedRevision.",
    );
  }
  return {
    bookId: body.bookId.trim(),
    style: body.style,
    expectedRevision: body.expectedRevision,
  };
}

export async function buildUpdateBookStyleResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<UpdateBookStyleResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const input = parseRequest(body);
    const book = await getBook(input.bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);
    const result = await persistBookStyle(input.bookId, input.style, input.expectedRevision);
    return { statusCode: 200, body: result };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof StyleValidationError) {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: error.message },
      };
    }
    if (error instanceof StyleNotFoundError) {
      return { statusCode: 404, body: { code: "not-found", message: error.message } };
    }
    if (error instanceof StyleConflictError) {
      return {
        statusCode: 409,
        body: {
          code: "conflict",
          message: error.message,
          style: error.style,
          styleRevision: error.styleRevision,
        },
      };
    }
    throw error;
  }
}

export const updateBookStyle = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildUpdateBookStyleResponse(
        request.headers.authorization,
        request.body,
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

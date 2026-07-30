import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { deleteBook } from "../services/books.js";

export type DeleteBookSuccess = { status: "ok" };
export type DeleteBookError = { code: string; message: string };
export type DeleteBookResult =
  | { statusCode: 200; body: DeleteBookSuccess }
  | { statusCode: 400 | 401 | 404; body: DeleteBookError };

function parseBody(body: unknown): { bookId: string } | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bookId !== "string" ||
    !(body as Record<string, unknown>).bookId ||
    (body as Record<string, unknown>).confirmation !== "DELETE"
  ) {
    return undefined;
  }
  return {
    bookId: (body as Record<string, unknown>).bookId as string,
  };
}

export async function buildDeleteBookResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<DeleteBookResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: {
        code: "invalid-argument",
        message: "A non-empty bookId and DELETE confirmation are required.",
      },
    };
  }

  try {
    const decoded = await verifyIdToken(authorizationHeader);
    await deleteBook(parsed.bookId, decoded.uid);
    return { statusCode: 200, body: { status: "ok" } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    const err = error as Error;
    if (err.message === "Book not found.") {
      return { statusCode: 404, body: { code: "not-found", message: err.message } };
    }
    if (err.message === "Permission denied.") {
      return { statusCode: 401, body: { code: "permission-denied", message: err.message } };
    }
    throw error;
  }
}

export const deleteBookEndpoint = onRequest(
  { cors: allowedOrigins(), region: "us-central1", timeoutSeconds: 540 },
  async (request, response) => {
    try {
      const result = await buildDeleteBookResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

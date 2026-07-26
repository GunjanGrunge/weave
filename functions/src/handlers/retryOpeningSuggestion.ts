import { onRequest } from "firebase-functions/v2/https";

import { GOOGLE_API_KEY } from "../config/secrets.js";
import { runIntakeOpeningSuggestion } from "../pipelines/intake.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook } from "../services/books.js";
import type { OpeningSuggestion } from "../services/gemini.js";

export type RetryOpeningSuggestionSuccess = {
  status: "ok" | "failed";
  openings: OpeningSuggestion[];
};
export type RetryOpeningSuggestionError = { code: string; message: string };

export type RetryOpeningSuggestionResult =
  | { statusCode: 200; body: RetryOpeningSuggestionSuccess }
  | { statusCode: 400; body: RetryOpeningSuggestionError }
  | { statusCode: 401; body: RetryOpeningSuggestionError }
  | { statusCode: 404; body: RetryOpeningSuggestionError };

function parseBookId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const bookId = (body as Record<string, unknown>).bookId;
  return typeof bookId === "string" && bookId.length > 0 ? bookId : undefined;
}

export async function buildRetryOpeningSuggestionResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKey: string,
): Promise<RetryOpeningSuggestionResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const bookId = parseBookId(body);
    if (!bookId) {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: "Request body must include a bookId." },
      };
    }

    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }

    assertOwnership(decoded.uid, book.uid);

    const result = await runIntakeOpeningSuggestion(bookId, apiKey);
    return { statusCode: 200, body: { status: result.status, openings: result.openings } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const retryOpeningSuggestion = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
    secrets: [GOOGLE_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildRetryOpeningSuggestionResponse(
        request.headers.authorization,
        request.body,
        GOOGLE_API_KEY.value(),
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

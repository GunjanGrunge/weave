import { onRequest } from "firebase-functions/v2/https";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runIntakeOpeningSuggestion } from "../pipelines/intake.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook } from "../services/books.js";
import type { AIProviderKeys, OpeningSuggestion } from "../services/gemini.js";

const RETRY_OPENING_SUGGESTION_TIMEOUT_MS = 12_000;

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

export async function buildRetryOpeningSuggestionResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
  openingSuggestionTimeoutMs = RETRY_OPENING_SUGGESTION_TIMEOUT_MS,
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

    const result = await runOpeningSuggestionWithTimeout(
      bookId,
      apiKeys,
      openingSuggestionTimeoutMs,
    );
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
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildRetryOpeningSuggestionResponse(
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

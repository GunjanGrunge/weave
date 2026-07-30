import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import { requestStoryBibleRebuild } from "../services/storyBible.js";

type RebuildResult =
  | {
      statusCode: 202;
      body: { status: "started"; sceneCount: number };
    }
  | {
      statusCode: 400 | 401 | 404;
      body: { code: string; message: string };
    };

function bookIdFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>).bookId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function buildRebuildStoryBibleResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<RebuildResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const bookId = bookIdFromBody(body);
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
    const result = await requestStoryBibleRebuild(bookId);
    return { statusCode: 202, body: { status: "started", ...result } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const rebuildStoryBible = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildRebuildStoryBibleResponse(
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

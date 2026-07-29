import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import {
  appendChatMessage,
  createNextChapter,
  getBook,
  NoChaptersError,
} from "../services/books.js";

export type CreateChapterSuccess = {
  chapterId: string;
  order: number;
};

export type CreateChapterError = { code: string; message: string };

export type CreateChapterResult =
  | { statusCode: 200; body: CreateChapterSuccess }
  | { statusCode: 400 | 401 | 404 | 409; body: CreateChapterError };

function parseBody(body: unknown): { bookId: string } | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bookId !== "string" ||
    !(body as Record<string, unknown>).bookId
  ) {
    return undefined;
  }
  return { bookId: (body as Record<string, unknown>).bookId as string };
}

export async function buildCreateChapterResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<CreateChapterResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: { code: "invalid-argument", message: "A non-empty bookId is required." },
    };
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    uid = decoded.uid;
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }

  const book = await getBook(parsed.bookId);
  if (!book) {
    return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
  }
  if (book.uid !== uid) {
    return {
      statusCode: 401,
      body: { code: "permission-denied", message: "You do not own this book." },
    };
  }

  try {
    const result = await createNextChapter(parsed.bookId);
    const chapterNumber = result.order + 1;
    const systemText = `Chapter ${chapterNumber} started. The previous chapter is being archived in the background.`;
    await appendChatMessage(parsed.bookId, "system", systemText);
    return { statusCode: 200, body: { chapterId: result.chapterId, order: result.order } };
  } catch (error) {
    if (error instanceof NoChaptersError) {
      return {
        statusCode: 409,
        body: {
          code: "failed-precondition",
          message: "This book has no chapters yet; cannot create the next one.",
        },
      };
    }
    throw error;
  }
}

export const createChapter = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildCreateChapterResponse(
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

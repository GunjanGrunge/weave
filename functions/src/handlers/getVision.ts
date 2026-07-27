import { onRequest } from "firebase-functions/v2/https";

import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook, getVisionDocument } from "../services/books.js";
import type { Book } from "../types/book.js";
import type { VisionDocument } from "../types/vision.js";

export type GetVisionSuccess = {
  book: Pick<Book, "title" | "style"> & { bookId: string };
  vision: VisionDocument;
};
export type GetVisionError = { code: string; message: string };

export type GetVisionResult =
  | { statusCode: 200; body: GetVisionSuccess }
  | { statusCode: 400; body: GetVisionError }
  | { statusCode: 401; body: GetVisionError }
  | { statusCode: 404; body: GetVisionError };

function parseBookId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const bookId = (body as Record<string, unknown>).bookId;
  return typeof bookId === "string" && bookId.length > 0 ? bookId : undefined;
}

export async function buildGetVisionResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<GetVisionResult> {
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

    const vision = await getVisionDocument(bookId);
    if (!vision) {
      return { statusCode: 404, body: { code: "not-found", message: "Vision document not found." } };
    }

    return {
      statusCode: 200,
      body: { book: { bookId, title: book.title, style: book.style }, vision },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const getVision = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
  },
  async (request, response) => {
    try {
      const result = await buildGetVisionResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

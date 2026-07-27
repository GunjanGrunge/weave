import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { verifyIdToken, AuthError } from "../services/auth.js";
import { listOwnedBooks } from "../services/books.js";
import type { Style } from "../types/book.js";

export type BookSummary = {
  bookId: string;
  title: string;
  style: Style;
  createdAt: string | null;
};

type ListBooksResult =
  | { statusCode: 200; body: { books: BookSummary[] } }
  | { statusCode: 401; body: { code: string; message: string } };

function timestampToIso(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

export async function buildListBooksResponse(
  authorizationHeader: string | undefined,
): Promise<ListBooksResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const books = await listOwnedBooks(decoded.uid);
    return {
      statusCode: 200,
      body: {
        books: books.map((book) => ({
          bookId: book.bookId,
          title: book.title,
          style: book.style,
          createdAt: timestampToIso(book.createdAt),
        })),
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const listBooks = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildListBooksResponse(request.headers.authorization);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

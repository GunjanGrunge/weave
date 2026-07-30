import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import { getCanonicalRoster, listStoryBibleCharacters } from "../services/storyBible.js";
import type { CharacterProfile, StoryBibleMemoryState } from "../types/storyBible.js";

type StoryBibleErrorBody = { code: string; message: string };
type StoryBibleSuccessBody = {
  book: { bookId: string; title: string };
  memoryState: StoryBibleMemoryState;
  characters: CharacterProfile[];
};

export type GetStoryBibleResult =
  | { statusCode: 200; body: StoryBibleSuccessBody }
  | { statusCode: 400 | 401 | 404; body: StoryBibleErrorBody };

function parseBookId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const bookId = (body as Record<string, unknown>).bookId;
  return typeof bookId === "string" && bookId.trim() ? bookId.trim() : undefined;
}

export async function buildGetStoryBibleResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<GetStoryBibleResult> {
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

    const roster = await getCanonicalRoster(bookId);
    const characters = await listStoryBibleCharacters(bookId);
    const memoryState: StoryBibleMemoryState = roster.state;

    return {
      statusCode: 200,
      body: {
        book: { bookId, title: book.title },
        memoryState,
        characters,
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const getStoryBible = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildGetStoryBibleResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

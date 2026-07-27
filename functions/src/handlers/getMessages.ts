import { onRequest } from "firebase-functions/v2/https";

import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook, getMessages as getMessagesForBook } from "../services/books.js";
import type { ChatMessage } from "../types/chatMessage.js";

export type GetMessagesSuccess = { messages: ChatMessage[] };
export type GetMessagesError = { code: string; message: string };

export type GetMessagesResult =
  | { statusCode: 200; body: GetMessagesSuccess }
  | { statusCode: 400; body: GetMessagesError }
  | { statusCode: 401; body: GetMessagesError }
  | { statusCode: 404; body: GetMessagesError };

function parseBookId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const bookId = (body as Record<string, unknown>).bookId;
  return typeof bookId === "string" && bookId.length > 0 ? bookId : undefined;
}

export async function buildGetMessagesResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<GetMessagesResult> {
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

    const messages = await getMessagesForBook(bookId);
    return { statusCode: 200, body: { messages } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const getMessages = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
  },
  async (request, response) => {
    try {
      const result = await buildGetMessagesResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

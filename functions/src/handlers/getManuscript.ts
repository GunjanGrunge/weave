import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { readBookManuscript, SnapshotError, type BookManuscript } from "../services/snapshots.js";

export type GetManuscriptResult =
  | { statusCode: 200; body: { manuscript: BookManuscript } }
  | {
      statusCode: 400 | 401 | 404;
      body: { code: string; message: string };
    };

function parseBookId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const bookId = (body as Record<string, unknown>).bookId;
  return typeof bookId === "string" && bookId.trim() ? bookId.trim() : undefined;
}

export async function buildGetManuscriptResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<GetManuscriptResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const bookId = parseBookId(body);
    if (!bookId) {
      return {
        statusCode: 400,
        body: { code: "invalid-argument", message: "Request body must include a bookId." },
      };
    }

    const manuscript = await readBookManuscript(bookId, decoded.uid);
    return { statusCode: 200, body: { manuscript } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof SnapshotError) {
      const statusCode =
        error.code === "not-found" ? 404 : error.code === "permission-denied" ? 401 : 400;
      return { statusCode, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const getManuscript = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildGetManuscriptResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

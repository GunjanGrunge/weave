import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { createBookSnapshot, SnapshotError } from "../services/snapshots.js";

export type SaveSnapshotSuccess = { snapshotId: string };
export type SaveSnapshotError = { code: string; message: string };
export type SaveSnapshotResult =
  | { statusCode: 200; body: SaveSnapshotSuccess }
  | { statusCode: 400 | 401 | 404; body: SaveSnapshotError };

function parseBody(body: unknown): { bookId: string; name: string } | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bookId !== "string" ||
    !(body as Record<string, unknown>).bookId ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    !(body as Record<string, unknown>).name
  ) {
    return undefined;
  }
  return {
    bookId: (body as Record<string, unknown>).bookId as string,
    name: (body as Record<string, unknown>).name as string,
  };
}

export async function buildSaveSnapshotResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<SaveSnapshotResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: { code: "invalid-argument", message: "A non-empty bookId and name are required." },
    };
  }

  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const snapshotId = await createBookSnapshot(parsed.bookId, parsed.name, decoded.uid);
    return { statusCode: 200, body: { snapshotId } };
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

export const saveSnapshot = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildSaveSnapshotResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

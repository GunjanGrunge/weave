import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { restoreBookSnapshot, SnapshotError } from "../services/snapshots.js";

export type RestoreSnapshotSuccess = { status: "ok" };
export type RestoreSnapshotError = { code: string; message: string };
export type RestoreSnapshotResult =
  | { statusCode: 200; body: RestoreSnapshotSuccess }
  | { statusCode: 400 | 401 | 404; body: RestoreSnapshotError };

function parseBody(
  body: unknown,
): { bookId: string; snapshotId: string; confirmed: boolean } | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bookId !== "string" ||
    !(body as Record<string, unknown>).bookId ||
    typeof (body as Record<string, unknown>).snapshotId !== "string" ||
    !(body as Record<string, unknown>).snapshotId
  ) {
    return undefined;
  }
  return {
    bookId: (body as Record<string, unknown>).bookId as string,
    snapshotId: (body as Record<string, unknown>).snapshotId as string,
    confirmed: !!(body as Record<string, unknown>).confirmed,
  };
}

export async function buildRestoreSnapshotResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<RestoreSnapshotResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: { code: "invalid-argument", message: "A non-empty bookId and snapshotId are required." },
    };
  }

  try {
    const decoded = await verifyIdToken(authorizationHeader);
    await restoreBookSnapshot(parsed.bookId, parsed.snapshotId, parsed.confirmed, decoded.uid);
    return { statusCode: 200, body: { status: "ok" } };
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

export const restoreSnapshot = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildRestoreSnapshotResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

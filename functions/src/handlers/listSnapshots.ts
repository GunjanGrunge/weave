import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { listBookSnapshots, SnapshotError } from "../services/snapshots.js";

export type SnapshotSummary = { id: string; name: string; createdAt: string | null };
export type ListSnapshotsSuccess = { snapshots: SnapshotSummary[] };
export type ListSnapshotsError = { code: string; message: string };
export type ListSnapshotsResult =
  | { statusCode: 200; body: ListSnapshotsSuccess }
  | { statusCode: 400 | 401 | 404; body: ListSnapshotsError };

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

export async function buildListSnapshotsResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<ListSnapshotsResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: { code: "invalid-argument", message: "A non-empty bookId is required." },
    };
  }

  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const snapshots = await listBookSnapshots(parsed.bookId, decoded.uid);
    return {
      statusCode: 200,
      body: {
        snapshots: snapshots.map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: timestampToIso(s.createdAt),
        })),
      },
    };
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

export const listSnapshots = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildListSnapshotsResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

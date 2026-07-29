import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { AuthError, verifyIdToken } from "../services/auth.js";
import { exportBookManuscript, SnapshotError } from "../services/snapshots.js";

export type ExportBookSuccess = { downloadUrl: string };
export type ExportBookError = { code: string; message: string };
export type ExportBookResult =
  | { statusCode: 200; body: ExportBookSuccess }
  | { statusCode: 400 | 401 | 404; body: ExportBookError };

function parseBody(
  body: unknown,
): { bookId: string; format: "markdown" | "plain-text" } | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bookId !== "string" ||
    !(body as Record<string, unknown>).bookId ||
    ((body as Record<string, unknown>).format !== "markdown" &&
      (body as Record<string, unknown>).format !== "plain-text")
  ) {
    return undefined;
  }
  return {
    bookId: (body as Record<string, unknown>).bookId as string,
    format: (body as Record<string, unknown>).format as "markdown" | "plain-text",
  };
}

export async function buildExportBookResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<ExportBookResult> {
  const parsed = parseBody(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: {
        code: "invalid-argument",
        message: "A non-empty bookId and format ('markdown' or 'plain-text') are required.",
      },
    };
  }

  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const downloadUrl = await exportBookManuscript(parsed.bookId, parsed.format, decoded.uid);
    return { statusCode: 200, body: { downloadUrl } };
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

export const exportBook = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildExportBookResponse(request.headers.authorization, request.body);
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

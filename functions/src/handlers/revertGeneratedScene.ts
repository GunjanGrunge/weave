import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { revertGeneratedCandidate } from "../services/scenes.js";
import {
  authorizeBook,
  mutationError,
  parseSessionMutation,
  publicCandidate,
  type SceneMutationError,
} from "./sceneMutation.js";

export type RevertGeneratedSceneResult =
  | { statusCode: 200; body: ReturnType<typeof publicCandidate> }
  | { statusCode: 400 | 401 | 404 | 409; body: SceneMutationError };

export async function buildRevertGeneratedSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<RevertGeneratedSceneResult> {
  const parsed = parseSessionMutation(body);
  if (!parsed) {
    return {
      statusCode: 400,
      body: { code: "invalid-argument", message: "A book, session, and revision are required." },
    };
  }
  try {
    await authorizeBook(authorizationHeader, parsed.bookId);
    const candidate = await revertGeneratedCandidate(
      parsed.bookId,
      parsed.sessionId,
      parsed.expectedRevision,
    );
    return { statusCode: 200, body: publicCandidate(candidate) };
  } catch (error) {
    const mapped = mutationError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

export const revertGeneratedScene = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildRevertGeneratedSceneResponse(
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

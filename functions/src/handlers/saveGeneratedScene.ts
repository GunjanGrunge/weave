import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { saveGeneratedCandidate } from "../services/scenes.js";
import {
  authorizeBook,
  mutationError,
  parseSessionMutation,
  publicCandidate,
  type SceneMutationError,
} from "./sceneMutation.js";

const MAX_SCENE_LENGTH = 50_000;

export type SaveGeneratedSceneResult =
  | { statusCode: 200; body: ReturnType<typeof publicCandidate> }
  | { statusCode: 400 | 401 | 404 | 409; body: SceneMutationError };

export async function buildSaveGeneratedSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<SaveGeneratedSceneResult> {
  const parsed = parseSessionMutation(body);
  const text =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).text
      : undefined;
  if (
    !parsed ||
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > MAX_SCENE_LENGTH
  ) {
    return {
      statusCode: 400,
      body: {
        code: "invalid-argument",
        message: "A book, session, revision, and non-empty scene text are required.",
      },
    };
  }

  try {
    await authorizeBook(authorizationHeader, parsed.bookId);
    const candidate = await saveGeneratedCandidate(
      parsed.bookId,
      parsed.sessionId,
      text,
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

export const saveGeneratedScene = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildSaveGeneratedSceneResponse(
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

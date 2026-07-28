import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { acceptGeneratedCandidate } from "../services/scenes.js";
import {
  authorizeBook,
  mutationError,
  parseSessionMutation,
  publicCandidate,
  type SceneMutationError,
} from "./sceneMutation.js";

type AcceptSceneSuccess = {
  sceneId: string;
  order: number;
  candidate: ReturnType<typeof publicCandidate>;
};
export type AcceptSceneResult =
  | { statusCode: 200; body: AcceptSceneSuccess }
  | { statusCode: 400 | 401 | 404 | 409; body: SceneMutationError };

export async function buildAcceptSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
): Promise<AcceptSceneResult> {
  const parsed = parseSessionMutation(body);
  if (!parsed || !parsed.idempotencyKey) {
    return {
      statusCode: 400,
      body: {
        code: "invalid-argument",
        message: "A book, session, revision, and idempotency key are required.",
      },
    };
  }
  try {
    await authorizeBook(authorizationHeader, parsed.bookId);
    const result = await acceptGeneratedCandidate(
      parsed.bookId,
      parsed.sessionId,
      parsed.expectedRevision,
    );
    return {
      statusCode: 200,
      body: {
        sceneId: result.sceneId,
        order: result.order,
        candidate: publicCandidate(result.session),
      },
    };
  } catch (error) {
    const mapped = mutationError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

export const acceptScene = onRequest(
  { cors: allowedOrigins(), region: "us-central1" },
  async (request, response) => {
    try {
      const result = await buildAcceptSceneResponse(
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

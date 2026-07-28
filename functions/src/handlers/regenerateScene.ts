import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runRegenerate } from "../pipelines/generate.js";
import type { AIProviderKeys } from "../services/gemini.js";
import { fenceTimedOutRegeneration } from "../services/scenes.js";
import {
  authorizeBook,
  mutationError,
  parseSessionMutation,
  publicCandidate,
  type SceneMutationError,
} from "./sceneMutation.js";

const REGENERATE_TIMEOUT_MS = 55_000;

export type RegenerateSceneResult =
  | { statusCode: 200; body: ReturnType<typeof publicCandidate> }
  | { statusCode: 202 | 400 | 401 | 404 | 409 | 502; body: SceneMutationError };

function withTimeout(
  work: ReturnType<typeof runRegenerate>,
  onTimeout: () => Promise<Awaited<ReturnType<typeof runRegenerate>>>,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof runRegenerate>>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Awaited<ReturnType<typeof runRegenerate>>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      void onTimeout()
        .then(finish)
        .catch((error) => {
          console.error("regenerateScene: timeout fence failed", error);
          finish({ status: "failed" });
        });
    }, timeoutMs);
    work
      .then((result) => {
        finish(result);
      })
      .catch((error) => {
        console.error("regenerateScene: pipeline rejected", error);
        finish({ status: "failed" });
      });
  });
}

export async function buildRegenerateSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
  timeoutMs = REGENERATE_TIMEOUT_MS,
): Promise<RegenerateSceneResult> {
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
  const idempotencyKey = parsed.idempotencyKey;
  try {
    await authorizeBook(authorizationHeader, parsed.bookId);
    const result = await withTimeout(
      runRegenerate(
        parsed.bookId,
        parsed.sessionId,
        parsed.expectedRevision,
        idempotencyKey,
        apiKeys,
      ),
      async () => {
        const fenced = await fenceTimedOutRegeneration(
          parsed.bookId,
          parsed.sessionId,
          idempotencyKey,
        );
        return fenced.status === "completed"
          ? { status: "ok", actionable: true, ...fenced.result }
          : { status: "failed" };
      },
      timeoutMs,
    );
    if (result.status === "in-progress") {
      return {
        statusCode: 202,
        body: {
          code: "generation-in-progress",
          message: "Regeneration is still in progress. Retry shortly.",
        },
      };
    }
    if (result.status !== "ok" || !result.actionable) {
      return {
        statusCode: 502,
        body: {
          code: "generation-failed",
          message: "Regeneration failed or timed out. Your current scene is unchanged.",
        },
      };
    }
    return {
      statusCode: 200,
      body: publicCandidate({
        sessionId: result.sessionId,
        messageId: result.messageId,
        text: result.text,
        revision: result.revision,
        candidateStatus: result.candidateStatus,
        provider: result.provider,
        model: result.model,
        previousAttempt: result.previousAttempt,
        acceptedSceneId: result.acceptedSceneId,
        acceptedSceneOrder: result.acceptedSceneOrder,
      }),
    };
  } catch (error) {
    const mapped = mutationError(error);
    if (mapped) {
      return mapped;
    }
    throw error;
  }
}

export const regenerateScene = onRequest(
  {
    cors: allowedOrigins(),
    region: "us-central1",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildRegenerateSceneResponse(
        request.headers.authorization,
        request.body,
        { gemini: GOOGLE_API_KEY.value(), openai: OPENAI_API_KEY.value() },
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

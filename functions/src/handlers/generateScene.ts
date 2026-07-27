import { onRequest } from "firebase-functions/v2/https";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runGenerate } from "../pipelines/generate.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { appendChatMessage, getBook } from "../services/books.js";
import type { AIProviderKeys } from "../services/gemini.js";

const GENERATE_SCENE_TIMEOUT_MS = 25_000;

export type GenerateSceneSuccess = {
  sessionId: string;
  text: string;
  provider: "openai" | "gemini";
  model: string;
};
export type GenerateSceneError = { code: string; message: string };

export type GenerateSceneResult =
  | { statusCode: 200; body: GenerateSceneSuccess }
  | { statusCode: 400; body: GenerateSceneError }
  | { statusCode: 401; body: GenerateSceneError }
  | { statusCode: 404; body: GenerateSceneError }
  | { statusCode: 502; body: GenerateSceneError };

function parseInput(body: unknown): { bookId: string; description: string } | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const bookId = (body as Record<string, unknown>).bookId;
  const description = (body as Record<string, unknown>).description;
  if (typeof bookId !== "string" || bookId.length === 0) {
    return undefined;
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return undefined;
  }
  return { bookId, description };
}

function runGenerateWithTimeout(
  bookId: string,
  description: string,
  apiKeys: AIProviderKeys,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof runGenerate>>> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ status: "failed" }), timeoutMs);

    runGenerate(bookId, description, apiKeys)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve({ status: "failed" });
      });
  });
}

export async function buildGenerateSceneResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
  timeoutMs = GENERATE_SCENE_TIMEOUT_MS,
): Promise<GenerateSceneResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const input = parseInput(body);
    if (!input) {
      return {
        statusCode: 400,
        body: {
          code: "invalid-argument",
          message: "Request body must include a bookId and a non-empty description.",
        },
      };
    }

    const book = await getBook(input.bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const result = await runGenerateWithTimeout(input.bookId, input.description, apiKeys, timeoutMs);
    if (result.status !== "ok") {
      return {
        statusCode: 502,
        body: { code: "generation-failed", message: "Scene generation failed or timed out." },
      };
    }

    await appendChatMessage(input.bookId, "assistant_scene", result.text);

    return {
      statusCode: 200,
      body: {
        sessionId: result.sessionId,
        text: result.text,
        provider: result.provider,
        model: result.model,
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

export const generateScene = onRequest(
  {
    cors: ["https://backupapp-bbf71.web.app"],
    region: "us-central1",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    try {
      const result = await buildGenerateSceneResponse(request.headers.authorization, request.body, {
        gemini: GOOGLE_API_KEY.value(),
        openai: OPENAI_API_KEY.value(),
      });
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

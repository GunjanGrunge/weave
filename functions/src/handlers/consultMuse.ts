import { randomUUID } from "node:crypto";

import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runGenerate } from "../pipelines/generate.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import {
  getBook,
  getVisionDocument,
  getMessages,
  appendMuseConversation,
} from "../services/books.js";
import { classifyMuseReadiness, type AIProviderKeys } from "../services/gemini.js";
import { getCanonicalRoster } from "../services/storyBible.js";

const MAX_MESSAGE_LENGTH = 4_000;

export type ConsultMuseSuccess =
  | { mode: "clarify"; text: string; provider: "openai" | "gemini"; model: string }
  | {
      mode: "draft";
      sessionId: string;
      messageId: string;
      text: string;
      provider: "openai" | "gemini";
      model: string;
      revision: number;
      status?: "active" | "accepted";
      actionable: boolean;
    };
type ConsultMuseError = { code: string; message: string };
export type ConsultMuseResult =
  | { statusCode: 200; body: ConsultMuseSuccess }
  | { statusCode: 202 | 400 | 401 | 404 | 502; body: ConsultMuseError };

function parseRequest(
  body: unknown,
): { bookId: string; message: string; idempotencyKey: string } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const bookId = record.bookId;
  const message = record.message;
  if (
    typeof bookId !== "string" ||
    !bookId.trim() ||
    bookId.includes("/") ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return undefined;
  }
  const suppliedKey = record.idempotencyKey;
  if (
    suppliedKey !== undefined &&
    (typeof suppliedKey !== "string" ||
      suppliedKey.length < 8 ||
      suppliedKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(suppliedKey))
  ) {
    return undefined;
  }
  return {
    bookId: bookId.trim(),
    message: message.trim(),
    idempotencyKey: typeof suppliedKey === "string" ? suppliedKey : randomUUID(),
  };
}

function buildMusePrompt(input: {
  message: string;
  vision: Awaited<ReturnType<typeof getVisionDocument>>;
  roster: string;
  recentConversation: string;
}): string {
  return [
    "You are WEAVE's Muse: a seasoned novelist and developmental editor working alongside an author who wants you to write, not interview them.",
    'WEAVE builds a novel one small stitch at a time. Your job each turn is to classify whether there is enough to draft the next beat, then respond as JSON: { "readiness": "draft" | "clarify", "note": "..." }.',
    "Classify readiness as \"draft\" whenever the writer has given a narrative anchor for this beat: someone doing or feeling something, even loosely sketched (for example: 'a young guy celebrating his farewell, settled in'). Under-specified details such as name, exact setting, tone, or point of view are NOT blockers — invent sensible, reversible choices for them during drafting rather than asking about them here.",
    'Classify readiness as "clarify" ONLY when either: (a) the writer\'s message conflicts with an established Story Bible fact, or (b) there is no narrative anchor at all to write from (no one doing or feeling anything). Uncertainty from the writer such as "I don\'t know" or "you decide" is never a reason to clarify — treat it as license to invent.',
    'When readiness is "clarify", note must be 90 words or fewer: one short observation, then exactly one purposeful question or at most two compact options, addressing only the genuine blocker.',
    'When readiness is "draft", note may be a short one-sentence acknowledgment of what you\'re about to write, or an empty string.',
    "Never draft manuscript prose, a chapter, a scene, or a long plan in this response yourself — only classify and, if clarifying, ask. The actual prose is written by a separate drafting step.",
    "Do not invent canonical facts as settled; treat the Story Bible as authoritative.",
    "",
    `CURRENT VISION:\nTheme: ${input.vision?.theme || "not set"}\nPremise: ${input.vision?.premise || "not set"}`,
    input.roster
      ? `\nSTORY BIBLE:\n${input.roster}`
      : "\nSTORY BIBLE: No established characters yet.",
    input.recentConversation
      ? `\nRECENT CONVERSATION:\n${input.recentConversation}`
      : "\nRECENT CONVERSATION: This is the first exchange.",
    `\nWRITER: ${input.message}`,
  ].join("\n");
}

export async function buildConsultMuseResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
): Promise<ConsultMuseResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const request = parseRequest(body);
    if (!request) {
      return {
        statusCode: 400,
        body: {
          code: "invalid-argument",
          message: "Include a bookId and a message up to 4,000 characters.",
        },
      };
    }
    const book = await getBook(request.bookId);
    if (!book) return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    assertOwnership(decoded.uid, book.uid);

    const [vision, roster, messages] = await Promise.all([
      getVisionDocument(request.bookId),
      getCanonicalRoster(request.bookId).catch(() => ({ text: "" })),
      getMessages(request.bookId),
    ]);
    const recentConversation = messages
      .slice(-12)
      .map(
        (message) =>
          `${message.type === "user" ? "WRITER" : "MUSE"}: ${message.text.slice(0, 800)}`,
      )
      .join("\n");
    const classification = await classifyMuseReadiness(
      request.bookId,
      buildMusePrompt({
        message: request.message,
        vision,
        roster: roster.text,
        recentConversation,
      }),
      apiKeys,
    );

    if (classification.readiness === "clarify") {
      await appendMuseConversation(request.bookId, request.message, classification.note);
      return {
        statusCode: 200,
        body: {
          mode: "clarify",
          text: classification.note,
          provider: classification.provider,
          model: classification.model,
        },
      };
    }

    const result = await runGenerate(
      request.bookId,
      { mode: "free-text", description: request.message },
      apiKeys,
      { idempotencyKey: request.idempotencyKey, userMessage: request.message },
    );
    if (result.status === "in-progress") {
      return {
        statusCode: 202,
        body: {
          code: "generation-in-progress",
          message: "This generation is still in progress. Retry shortly.",
        },
      };
    }
    if (result.status !== "ok") {
      return {
        statusCode: 502,
        body: { code: "generation-failed", message: "Scene generation failed or timed out." },
      };
    }
    return {
      statusCode: 200,
      body: {
        mode: "draft",
        sessionId: result.sessionId,
        messageId: result.messageId,
        text: result.text,
        provider: result.provider,
        model: result.model,
        revision: result.revision,
        status: result.actionable ? result.candidateStatus : undefined,
        actionable: result.actionable,
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    console.error("consultMuse failed", error);
    return {
      statusCode: 502,
      body: { code: "muse-unavailable", message: "The Muse is unavailable right now." },
    };
  }
}

export const consultMuse = onRequest(
  {
    cors: allowedOrigins(),
    region: "us-central1",
    timeoutSeconds: 180,
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    const result = await buildConsultMuseResponse(request.headers.authorization, request.body, {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    });
    response.status(result.statusCode).json(result.body);
  },
);

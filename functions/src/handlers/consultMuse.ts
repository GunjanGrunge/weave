import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import { getBook, getVisionDocument, appendMuseConversation } from "../services/books.js";
import { generateScene, type AIProviderKeys } from "../services/gemini.js";
import { getCanonicalRoster } from "../services/storyBible.js";

const MAX_MESSAGE_LENGTH = 4_000;

type ConsultMuseSuccess = {
  text: string;
  provider: "openai" | "gemini";
  model: string;
};
type ConsultMuseError = { code: string; message: string };
export type ConsultMuseResult =
  | { statusCode: 200; body: ConsultMuseSuccess }
  | { statusCode: 400 | 401 | 404 | 502; body: ConsultMuseError };

function parseRequest(body: unknown): { bookId: string; message: string } | undefined {
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
  return { bookId: bookId.trim(), message: message.trim() };
}

function buildMusePrompt(input: {
  message: string;
  vision: Awaited<ReturnType<typeof getVisionDocument>>;
  roster: string;
}): string {
  return [
    "You are WEAVE's Muse: a seasoned novelist and developmental editor in a working conversation with an author.",
    "Respond like a thoughtful creative collaborator, not a questionnaire or a generic assistant.",
    "Help the author explore premise, character, pacing, tension, voice, and continuity. Respect the author's intent and disagree politely when a choice weakens the story.",
    "Do not draft manuscript prose, a chapter, or a scene in this response. Instead give concise, useful editorial thinking and finish with one purposeful question or two concrete options.",
    "Do not invent canonical facts. Treat the Story Bible as authoritative; flag uncertainty rather than silently changing established details.",
    "Keep the response below 180 words.",
    "",
    `CURRENT VISION:\nTheme: ${input.vision?.theme || "not set"}\nPremise: ${input.vision?.premise || "not set"}`,
    input.roster ? `\nSTORY BIBLE:\n${input.roster}` : "\nSTORY BIBLE: No established characters yet.",
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
        body: { code: "invalid-argument", message: "Include a bookId and a message up to 4,000 characters." },
      };
    }
    const book = await getBook(request.bookId);
    if (!book) return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    assertOwnership(decoded.uid, book.uid);

    const [vision, roster] = await Promise.all([
      getVisionDocument(request.bookId),
      getCanonicalRoster(request.bookId).catch(() => ({ text: "" })),
    ]);
    const generated = await generateScene(
      request.bookId,
      buildMusePrompt({ message: request.message, vision, roster: roster.text }),
      apiKeys,
      "museConversation",
    );
    await appendMuseConversation(request.bookId, request.message, generated.text);
    return { statusCode: 200, body: generated };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    console.error("consultMuse failed", error);
    return { statusCode: 502, body: { code: "muse-unavailable", message: "The Muse is unavailable right now." } };
  }
}

export const consultMuse = onRequest(
  { cors: allowedOrigins(), region: "us-central1", timeoutSeconds: 120, secrets: [GOOGLE_API_KEY, OPENAI_API_KEY] },
  async (request, response) => {
    const result = await buildConsultMuseResponse(request.headers.authorization, request.body, {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    });
    response.status(result.statusCode).json(result.body);
  },
);

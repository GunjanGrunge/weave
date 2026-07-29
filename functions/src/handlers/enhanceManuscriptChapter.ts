import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook, getVisionDocument } from "../services/books.js";
import { GeminiError, type AIProviderKeys } from "../services/gemini.js";
import {
  commitChapterEdit,
  enhanceChapterEdit,
  ManuscriptEditError,
  prepareChapterEdit,
  type ManuscriptChapterEdit,
  type SavedChapterEdit,
} from "../services/manuscriptEditor.js";

const MAX_TITLE_LENGTH = 160;
const MAX_SCENE_LENGTH = 60_000;
const MAX_TOTAL_DRAFT_LENGTH = 120_000;
const MAX_EDITED_SCENES = 50;

type EnhanceManuscriptError = { code: string; message: string };
export type EnhanceManuscriptResult =
  | { statusCode: 200; body: { chapter: SavedChapterEdit } }
  | { statusCode: 400 | 401 | 404 | 409 | 502; body: EnhanceManuscriptError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number, trim = false): string {
  if (typeof value !== "string") {
    throw new ManuscriptEditError("invalid-argument", `${field} must be a string.`);
  }
  const parsed = trim ? value.trim() : value;
  if (!parsed || parsed.length > maxLength) {
    throw new ManuscriptEditError(
      "invalid-argument",
      `${field} must be between 1 and ${maxLength.toLocaleString("en-US")} characters.`,
    );
  }
  return parsed;
}

function parseRequest(body: unknown): { bookId: string; edit: ManuscriptChapterEdit } {
  if (!isRecord(body)) {
    throw new ManuscriptEditError("invalid-argument", "Request body must be an object.");
  }
  const bookId = requiredString(body.bookId, "bookId", 200, true);
  const chapterId = requiredString(body.chapterId, "chapterId", 200, true);
  const originalTitle = requiredString(body.originalTitle, "originalTitle", MAX_TITLE_LENGTH, true);
  const draftTitle = requiredString(body.draftTitle, "draftTitle", MAX_TITLE_LENGTH, true);
  if (!Array.isArray(body.scenes) || body.scenes.length > MAX_EDITED_SCENES) {
    throw new ManuscriptEditError(
      "invalid-argument",
      `scenes must contain at most ${MAX_EDITED_SCENES} entries.`,
    );
  }

  const sceneIds = new Set<string>();
  let totalDraftLength = draftTitle.length;
  const scenes = body.scenes.map((value, index) => {
    if (!isRecord(value)) {
      throw new ManuscriptEditError("invalid-argument", `scenes[${index}] must be an object.`);
    }
    const sceneId = requiredString(value.sceneId, `scenes[${index}].sceneId`, 200, true);
    if (sceneIds.has(sceneId)) {
      throw new ManuscriptEditError("invalid-argument", "Scene ids must be unique.");
    }
    sceneIds.add(sceneId);
    const originalText = requiredString(
      value.originalText,
      `scenes[${index}].originalText`,
      MAX_SCENE_LENGTH,
    );
    const draftText = requiredString(
      value.draftText,
      `scenes[${index}].draftText`,
      MAX_SCENE_LENGTH,
    );
    totalDraftLength += draftText.length;
    return { sceneId, originalText, draftText };
  });

  if (totalDraftLength > MAX_TOTAL_DRAFT_LENGTH) {
    throw new ManuscriptEditError(
      "invalid-argument",
      "This chapter edit is too large to enhance in one request.",
    );
  }
  return {
    bookId,
    edit: { chapterId, originalTitle, draftTitle, scenes },
  };
}

export async function buildEnhanceManuscriptResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
): Promise<EnhanceManuscriptResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const { bookId, edit } = parseRequest(body);
    const book = await getBook(bookId);
    if (!book) {
      return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    }
    assertOwnership(decoded.uid, book.uid);

    const prepared = await prepareChapterEdit(bookId, edit);
    const vision = await getVisionDocument(bookId);
    const enhanced = await enhanceChapterEdit(bookId, prepared, book.style, apiKeys, vision);
    const chapter = await commitChapterEdit(bookId, edit, enhanced);
    return { statusCode: 200, body: { chapter } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    if (error instanceof ManuscriptEditError) {
      const statusCode =
        error.code === "not-found"
          ? 404
          : error.code === "conflict"
            ? 409
            : error.code === "generation-failed"
              ? 502
              : 400;
      return { statusCode, body: { code: error.code, message: error.message } };
    }
    if (error instanceof GeminiError) {
      return {
        statusCode: 502,
        body: {
          code: "generation-failed",
          message: "WEAVE could not enhance this chapter right now. Your draft was not saved.",
        },
      };
    }
    throw error;
  }
}

export const enhanceManuscriptChapter = onRequest(
  {
    cors: allowedOrigins(),
    region: "us-central1",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
    timeoutSeconds: 120,
  },
  async (request, response) => {
    try {
      const result = await buildEnhanceManuscriptResponse(
        request.headers.authorization,
        request.body,
        {
          gemini: GOOGLE_API_KEY.value(),
          openai: OPENAI_API_KEY.value(),
        },
      );
      response.status(result.statusCode).json(result.body);
    } catch (error) {
      console.error(error);
      response.status(500).json({ code: "internal", message: "Unexpected error." });
    }
  },
);

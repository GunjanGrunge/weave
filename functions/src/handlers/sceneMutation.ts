import { assertOwnership, AuthError, verifyIdToken } from "../services/auth.js";
import { getBook } from "../services/books.js";
import {
  SceneSessionError,
  type CandidateResult,
} from "../services/scenes.js";

export type SceneMutationError = {
  code: string;
  message: string;
  canonical?: ReturnType<typeof publicCandidate>;
};

export function publicCandidate(candidate: CandidateResult) {
  return {
    sessionId: candidate.sessionId,
    messageId: candidate.messageId,
    text: candidate.text,
    revision: candidate.revision,
    status: candidate.candidateStatus,
    provider: candidate.provider,
    model: candidate.model,
    ...(candidate.previousAttempt ? { previousAttempt: candidate.previousAttempt } : {}),
    ...(candidate.acceptedSceneId ? { acceptedSceneId: candidate.acceptedSceneId } : {}),
    ...(typeof candidate.acceptedSceneOrder === "number"
      ? { acceptedSceneOrder: candidate.acceptedSceneOrder }
      : {}),
  };
}

export async function authorizeBook(
  authorizationHeader: string | undefined,
  bookId: string,
): Promise<void> {
  const decoded = await verifyIdToken(authorizationHeader);
  const book = await getBook(bookId);
  if (!book) {
    throw new SceneSessionError("not-found", "Book not found.");
  }
  assertOwnership(decoded.uid, book.uid);
}

export function mutationError(error: unknown):
  | { statusCode: 400 | 401 | 404 | 409; body: SceneMutationError }
  | undefined {
  if (error instanceof AuthError) {
    return { statusCode: 401, body: { code: error.code, message: error.message } };
  }
  if (error instanceof SceneSessionError) {
    const statusCode =
      error.code === "not-found"
        ? 404
        : error.code === "stale-revision" || error.code === "accepted"
          ? 409
          : 400;
    return {
      statusCode,
      body: {
        code: error.code,
        message: error.message,
        ...(error.canonical ? { canonical: publicCandidate(error.canonical) } : {}),
      },
    };
  }
  return undefined;
}

export function parseSessionMutation(body: unknown):
  | {
      bookId: string;
      sessionId: string;
      expectedRevision: number;
      idempotencyKey?: string;
    }
  | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.bookId !== "string" ||
    record.bookId.length === 0 ||
    typeof record.sessionId !== "string" ||
    record.sessionId.length === 0 ||
    !Number.isSafeInteger(record.expectedRevision) ||
    (record.expectedRevision as number) < 0
  ) {
    return undefined;
  }
  if (
    record.idempotencyKey !== undefined &&
    (typeof record.idempotencyKey !== "string" ||
      record.idempotencyKey.length < 8 ||
      record.idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(record.idempotencyKey))
  ) {
    return undefined;
  }
  return {
    bookId: record.bookId,
    sessionId: record.sessionId,
    expectedRevision: record.expectedRevision as number,
    ...(typeof record.idempotencyKey === "string"
      ? { idempotencyKey: record.idempotencyKey }
      : {}),
  };
}

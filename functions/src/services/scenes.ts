import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { AssembledContext } from "../pipelines/assembleContext.js";
import type {
  CandidateResult,
  GenerationOperation,
  GenerationSession,
  SceneAttempt,
} from "../types/generationSession.js";
import type { SceneInput } from "../types/sceneInput.js";

const LEASE_MS = 70_000;
export type { CandidateResult } from "../types/generationSession.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

export class SceneSessionError extends Error {
  constructor(
    public readonly code:
      | "not-found"
      | "stale-revision"
      | "accepted"
      | "in-progress"
      | "invalid-session",
    message: string,
    public readonly canonical?: CandidateResult,
  ) {
    super(message);
    this.name = "SceneSessionError";
  }
}

export type GenerationClaim =
  | { status: "claimed"; attemptToken: string }
  | { status: "in-progress" }
  | { status: "completed"; result: CandidateResult };

function candidateResult(sessionId: string, session: GenerationSession): CandidateResult {
  return {
    sessionId,
    messageId: session.messageId,
    text: session.candidate.text,
    revision: session.revision,
    candidateStatus: session.status,
    provider: session.candidate.provider,
    model: session.candidate.model,
    ...(session.previousAttempt ? { previousAttempt: session.previousAttempt } : {}),
    ...(session.acceptedSceneId ? { acceptedSceneId: session.acceptedSceneId } : {}),
    ...(typeof session.acceptedSceneOrder === "number"
      ? { acceptedSceneOrder: session.acceptedSceneOrder }
      : {}),
  };
}

export async function claimInitialGeneration(
  bookId: string,
  idempotencyKey: string,
): Promise<GenerationClaim> {
  const db = firestore();
  const ref = db
    .collection("books")
    .doc(bookId)
    .collection("generationRequests")
    .doc(idempotencyKey);
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() as
      | {
          status?: string;
          attemptToken?: string;
          leaseExpiresAt?: number;
          result?: CandidateResult;
        }
      | undefined;

    if (existing?.status === "completed" && existing.result) {
      return { status: "completed", result: existing.result };
    }
    if (
      existing?.status === "in-progress" &&
      typeof existing.leaseExpiresAt === "number" &&
      existing.leaseExpiresAt > now
    ) {
      return { status: "in-progress" };
    }

    const attemptToken = randomUUID();
    transaction.set(ref, {
      status: "in-progress",
      attemptToken,
      leaseExpiresAt: now + LEASE_MS,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { status: "claimed", attemptToken };
  });
}

export async function persistGeneratedCandidate(input: {
  bookId: string;
  idempotencyKey: string;
  attemptToken: string;
  sceneInput: SceneInput;
  userMessage: string;
  assembledContext: AssembledContext;
  candidate: SceneAttempt;
}): Promise<CandidateResult> {
  const db = firestore();
  const bookRef = db.collection("books").doc(input.bookId);
  const requestRef = bookRef.collection("generationRequests").doc(input.idempotencyKey);
  const sessionRef = bookRef.collection("sessions").doc();
  const userMessageRef = bookRef.collection("messages").doc();
  const assistantMessageRef = bookRef.collection("messages").doc();

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, bookSnapshot, lastMessage] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(bookRef),
      transaction.get(bookRef.collection("messages").orderBy("order", "desc").limit(1)),
    ]);
    const request = requestSnapshot.data() as
      | { status?: string; attemptToken?: string; result?: CandidateResult }
      | undefined;
    if (request?.status === "completed" && request.result) {
      return request.result;
    }
    if (request?.attemptToken !== input.attemptToken || request.status !== "in-progress") {
      throw new SceneSessionError("invalid-session", "This generation attempt is obsolete.");
    }

    const bookRevision =
      typeof bookSnapshot.data()?.manuscriptRevision === "number"
        ? (bookSnapshot.data()?.manuscriptRevision as number)
        : 0;
    const assembledRevision = input.assembledContext.manuscriptRevision ?? 0;
    if (bookRevision !== assembledRevision) {
      throw new SceneSessionError(
        "stale-revision",
        "The manuscript changed while this scene was generated.",
      );
    }

    const nextOrder = lastMessage.empty
      ? 0
      : ((lastMessage.docs[0]?.data().order as number | undefined) ?? -1) + 1;
    const now = FieldValue.serverTimestamp();
    const session: GenerationSession = {
      bookId: input.bookId,
      chapterId: input.assembledContext.chapterId ?? null,
      input: input.sceneInput,
      assembledContext: { priorScenesText: input.assembledContext.priorScenesText },
      manuscriptRevision: assembledRevision,
      candidate: input.candidate,
      revision: 0,
      messageId: assistantMessageRef.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const result = candidateResult(sessionRef.id, session);

    transaction.set(userMessageRef, {
      type: "user",
      text: input.userMessage,
      order: nextOrder,
      createdAt: now,
    });
    transaction.set(assistantMessageRef, {
      type: "assistant_scene",
      text: input.candidate.text,
      order: nextOrder + 1,
      createdAt: now,
      sessionId: sessionRef.id,
      revision: 0,
      status: "active",
      provider: input.candidate.provider,
      model: input.candidate.model,
    });
    transaction.set(sessionRef, session);
    transaction.set(
      requestRef,
      {
        status: "completed",
        result,
        updatedAt: now,
      },
      { merge: true },
    );
    return result;
  });
}

export async function failInitialGeneration(
  bookId: string,
  idempotencyKey: string,
  attemptToken: string,
): Promise<void> {
  const ref = firestore()
    .collection("books")
    .doc(bookId)
    .collection("generationRequests")
    .doc(idempotencyKey);

  await firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const request = snapshot.data() as
      | { status?: string; attemptToken?: string }
      | undefined;
    if (request?.status === "in-progress" && request.attemptToken === attemptToken) {
      transaction.set(
        ref,
        { status: "failed", updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  });
}

export async function saveGeneratedCandidate(
  bookId: string,
  sessionId: string,
  text: string,
  expectedRevision: number,
): Promise<CandidateResult> {
  const db = firestore();
  const sessionRef = db.collection("books").doc(bookId).collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      throw new SceneSessionError("not-found", "Generated scene session not found.");
    }
    const session = snapshot.data() as GenerationSession;
    const canonical = candidateResult(sessionId, session);
    if (session.status === "accepted") {
      throw new SceneSessionError("accepted", "This scene has already been accepted.", canonical);
    }
    if (session.revision !== expectedRevision) {
      throw new SceneSessionError(
        "stale-revision",
        "A newer saved version exists.",
        canonical,
      );
    }

    const revision = session.revision + 1;
    const updated: GenerationSession = {
      ...session,
      candidate: { ...session.candidate, text },
      revision,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(sessionRef, {
      "candidate.text": text,
      revision,
      updatedAt: updated.updatedAt,
    });
    transaction.update(
      db.collection("books").doc(bookId).collection("messages").doc(session.messageId),
      { text, revision },
    );
    return candidateResult(sessionId, updated);
  });
}

export async function loadGenerationSession(
  bookId: string,
  sessionId: string,
): Promise<GenerationSession | undefined> {
  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("sessions")
    .doc(sessionId)
    .get();
  return snapshot.exists ? (snapshot.data() as GenerationSession) : undefined;
}

export type RegenerationClaim =
  | { status: "claimed"; attemptToken: string; session: GenerationSession }
  | { status: "in-progress" }
  | { status: "completed"; result: CandidateResult };

export async function claimRegeneration(
  bookId: string,
  sessionId: string,
  idempotencyKey: string,
  expectedRevision: number,
): Promise<RegenerationClaim> {
  const db = firestore();
  const sessionRef = db.collection("books").doc(bookId).collection("sessions").doc(sessionId);
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      throw new SceneSessionError("not-found", "Generated scene session not found.");
    }
    const session = snapshot.data() as GenerationSession;
    const canonical = candidateResult(sessionId, session);
    if (session.status === "accepted") {
      throw new SceneSessionError("accepted", "This scene has already been accepted.", canonical);
    }

    const operation = session.regenerateOperation;
    if (
      operation?.idempotencyKey === idempotencyKey &&
      operation.status === "completed"
    ) {
      return { status: "completed", result: operation.result ?? canonical };
    }
    if (session.revision !== expectedRevision) {
      throw new SceneSessionError("stale-revision", "A newer candidate exists.", canonical);
    }
    if (
      operation?.status === "in-progress" &&
      operation.leaseExpiresAt > now
    ) {
      return { status: "in-progress" };
    }

    const attemptToken = randomUUID();
    const regenerateOperation: GenerationOperation = {
      idempotencyKey,
      attemptToken,
      leaseExpiresAt: now + LEASE_MS,
      expectedRevision,
      manuscriptRevision: session.manuscriptRevision,
      status: "in-progress",
    };
    transaction.update(sessionRef, { regenerateOperation });
    return {
      status: "claimed",
      attemptToken,
      session: { ...session, regenerateOperation },
    };
  });
}

export async function failRegeneration(
  bookId: string,
  sessionId: string,
  attemptToken: string,
): Promise<void> {
  const sessionRef = firestore()
    .collection("books")
    .doc(bookId)
    .collection("sessions")
    .doc(sessionId);

  await firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      return;
    }
    const operation = (snapshot.data() as GenerationSession).regenerateOperation;
    if (operation?.status === "in-progress" && operation.attemptToken === attemptToken) {
      transaction.update(sessionRef, {
        "regenerateOperation.status": "failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

export type TimeoutFenceResult =
  | { status: "fenced" }
  | { status: "completed"; result: CandidateResult };

export async function fenceTimedOutRegeneration(
  bookId: string,
  sessionId: string,
  idempotencyKey: string,
): Promise<TimeoutFenceResult> {
  const sessionRef = firestore()
    .collection("books")
    .doc(bookId)
    .collection("sessions")
    .doc(sessionId);

  return firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      return { status: "fenced" };
    }
    const session = snapshot.data() as GenerationSession;
    const operation = session.regenerateOperation;
    if (
      operation?.idempotencyKey === idempotencyKey &&
      operation.status === "completed"
    ) {
      return {
        status: "completed",
        result: operation.result ?? candidateResult(sessionId, session),
      };
    }
    if (
      operation?.idempotencyKey === idempotencyKey &&
      operation.status === "in-progress"
    ) {
      transaction.update(sessionRef, {
        "regenerateOperation.attemptToken": randomUUID(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { status: "fenced" };
  });
}

export async function commitRegeneration(input: {
  bookId: string;
  sessionId: string;
  attemptToken: string;
  expectedRevision: number;
  assembledContext: AssembledContext;
  candidate: SceneAttempt;
}): Promise<CandidateResult> {
  const db = firestore();
  const bookRef = db.collection("books").doc(input.bookId);
  const sessionRef = bookRef.collection("sessions").doc(input.sessionId);

  return db.runTransaction(async (transaction) => {
    const [sessionSnapshot, bookSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(bookRef),
    ]);
    if (!sessionSnapshot.exists) {
      throw new SceneSessionError("not-found", "Generated scene session not found.");
    }
    const session = sessionSnapshot.data() as GenerationSession;
    const canonical = candidateResult(input.sessionId, session);
    if (
      session.regenerateOperation?.attemptToken !== input.attemptToken ||
      session.regenerateOperation.status !== "in-progress"
    ) {
      throw new SceneSessionError("invalid-session", "This regenerate attempt is obsolete.");
    }
    if (session.revision !== input.expectedRevision) {
      throw new SceneSessionError("stale-revision", "A newer candidate exists.", canonical);
    }
    const currentManuscriptRevision =
      typeof bookSnapshot.data()?.manuscriptRevision === "number"
        ? (bookSnapshot.data()?.manuscriptRevision as number)
        : 0;
    const assembledRevision = input.assembledContext.manuscriptRevision ?? 0;
    if (currentManuscriptRevision !== assembledRevision) {
      throw new SceneSessionError(
        "stale-revision",
        "The manuscript changed during regeneration.",
        canonical,
      );
    }

    const revision = session.revision + 1;
    const updated: GenerationSession = {
      ...session,
      chapterId: input.assembledContext.chapterId ?? null,
      assembledContext: { priorScenesText: input.assembledContext.priorScenesText },
      manuscriptRevision: assembledRevision,
      previousAttempt: session.candidate,
      candidate: input.candidate,
      revision,
      regenerateOperation: {
        ...session.regenerateOperation,
        status: "completed",
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    const result = candidateResult(input.sessionId, updated);
    updated.regenerateOperation = {
      ...updated.regenerateOperation!,
      result,
    };
    transaction.set(sessionRef, updated);
    transaction.update(bookRef.collection("messages").doc(session.messageId), {
      text: input.candidate.text,
      revision,
      provider: input.candidate.provider,
      model: input.candidate.model,
      previousAttempt: session.candidate,
    });
    return result;
  });
}

export async function revertGeneratedCandidate(
  bookId: string,
  sessionId: string,
  expectedRevision: number,
): Promise<CandidateResult> {
  const db = firestore();
  const sessionRef = db.collection("books").doc(bookId).collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists) {
      throw new SceneSessionError("not-found", "Generated scene session not found.");
    }
    const session = snapshot.data() as GenerationSession;
    const canonical = candidateResult(sessionId, session);
    if (session.status === "accepted") {
      throw new SceneSessionError("accepted", "This scene has already been accepted.", canonical);
    }
    if (session.revision !== expectedRevision) {
      throw new SceneSessionError("stale-revision", "A newer candidate exists.", canonical);
    }
    if (!session.previousAttempt) {
      throw new SceneSessionError("invalid-session", "There is no prior attempt to restore.");
    }

    const revision = session.revision + 1;
    const restored = session.previousAttempt;
    const updated: GenerationSession = {
      ...session,
      candidate: restored,
      previousAttempt: undefined,
      revision,
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(sessionRef, {
      candidate: restored,
      previousAttempt: FieldValue.delete(),
      revision,
      updatedAt: updated.updatedAt,
    });
    transaction.update(
      db.collection("books").doc(bookId).collection("messages").doc(session.messageId),
      {
        text: restored.text,
        revision,
        provider: restored.provider,
        model: restored.model,
        previousAttempt: FieldValue.delete(),
      },
    );
    return candidateResult(sessionId, updated);
  });
}

export type AcceptedSceneResult = {
  sceneId: string;
  order: number;
  session: CandidateResult;
};

export async function acceptGeneratedCandidate(
  bookId: string,
  sessionId: string,
  expectedRevision: number,
): Promise<AcceptedSceneResult> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const sessionRef = bookRef.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists) {
      throw new SceneSessionError("not-found", "Generated scene session not found.");
    }
    const session = sessionSnapshot.data() as GenerationSession;
    if (
      session.status === "accepted" &&
      session.acceptedSceneId &&
      typeof session.acceptedSceneOrder === "number"
    ) {
      return {
        sceneId: session.acceptedSceneId,
        order: session.acceptedSceneOrder,
        session: candidateResult(sessionId, session),
      };
    }
    const canonical = candidateResult(sessionId, session);
    if (session.revision !== expectedRevision) {
      throw new SceneSessionError("stale-revision", "A newer candidate exists.", canonical);
    }
    if (!session.chapterId) {
      throw new SceneSessionError("invalid-session", "This session has no active chapter.");
    }

    const chapterRef = bookRef.collection("chapters").doc(session.chapterId);
    const [bookSnapshot, chapterSnapshot] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(chapterRef),
    ]);
    if (!bookSnapshot.exists || !chapterSnapshot.exists) {
      throw new SceneSessionError("not-found", "The session chapter no longer exists.");
    }

    const order =
      typeof chapterSnapshot.data()?.nextSceneOrder === "number"
        ? (chapterSnapshot.data()?.nextSceneOrder as number)
        : 0;
    const sceneRef = chapterRef.collection("scenes").doc();
    const manuscriptRevision =
      (typeof bookSnapshot.data()?.manuscriptRevision === "number"
        ? (bookSnapshot.data()?.manuscriptRevision as number)
        : 0) + 1;
    const now = FieldValue.serverTimestamp();
    const updated: GenerationSession = {
      ...session,
      status: "accepted",
      acceptedSceneId: sceneRef.id,
      acceptedSceneOrder: order,
      updatedAt: now,
    };

    transaction.set(sceneRef, {
      text: session.candidate.text,
      order,
      modelUsed: session.candidate.model,
      provider: session.candidate.provider,
      sourceSessionId: sessionId,
      createdAt: now,
    });
    transaction.update(chapterRef, { nextSceneOrder: order + 1 });
    transaction.update(bookRef, { manuscriptRevision });
    transaction.update(sessionRef, {
      status: "accepted",
      acceptedSceneId: sceneRef.id,
      acceptedSceneOrder: order,
      updatedAt: now,
    });
    transaction.update(bookRef.collection("messages").doc(session.messageId), {
      status: "accepted",
      acceptedSceneId: sceneRef.id,
    });

    return {
      sceneId: sceneRef.id,
      order,
      session: candidateResult(sessionId, updated),
    };
  });
}

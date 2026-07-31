import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import type { Book, Style } from "../types/book.js";
import type { Chapter } from "../types/chapter.js";
import type { ChatMessage, ChatMessageType } from "../types/chatMessage.js";
import type { Scene } from "../types/scene.js";
import type { VisionDocument } from "../types/vision.js";
import type { GenreProfile, VoiceProfile } from "../types/vision.js";
import {
  normalizeStoredStyle as normalizeCanonicalStoredStyle,
  parseStyleInput,
} from "./styles.js";
import {
  normalizeGenreProfile,
  normalizeVisionWritingProfiles,
  normalizeVoiceProfile,
} from "./writingProfiles.js";

export type PremiseAnswers = {
  whatToWrite?: string;
  mainCharacter?: string;
  roughPremise?: string;
};

export type CreateBookInput = {
  premiseAnswers: PremiseAnswers;
  style: Style;
  genreProfile?: GenreProfile;
  voiceProfile?: VoiceProfile;
  idempotencyKey?: string;
};

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStyle(style: Style): Style {
  return parseStyleInput(style);
}

function normalizeStoredStyle(value: unknown): Style {
  return normalizeCanonicalStoredStyle(value);
}

function buildMessages(
  _answers: Required<PremiseAnswers>,
  _style: Style,
  createdAt: unknown,
): ChatMessage[] {
  return [
    {
      type: "system",
      text:
        "This is a new writing room. Talk through the book with the Muse; nothing joins the manuscript until you request a scene and accept it.",
      order: 0,
      createdAt,
    },
  ];
}

export async function createBookWithIntake(
  uid: string,
  input: CreateBookInput,
): Promise<{ bookId: string }> {
  const db = firestore();

  // A replayed request (client retried after a dropped/unparseable response
  // to an already-committed submission) must not create a second book —
  // return the book the original request already created instead.
  if (input.idempotencyKey) {
    const existing = await db.collection("intakeRequests").doc(input.idempotencyKey).get();
    const existingData = existing.data();
    if (existing.exists && existingData?.uid === uid && typeof existingData.bookId === "string") {
      return { bookId: existingData.bookId };
    }
  }

  const batch = db.batch();
  const bookRef = db.collection("books").doc();
  const createdAt = FieldValue.serverTimestamp();
  const answers: Required<PremiseAnswers> = {
    whatToWrite: clean(input.premiseAnswers.whatToWrite),
    mainCharacter: clean(input.premiseAnswers.mainCharacter),
    roughPremise: clean(input.premiseAnswers.roughPremise),
  };
  const style = normalizeStyle(input.style);

  const book: Book = {
    uid,
    // A raw first thought is not a book title. Keep a clean draft title until
    // the writer names the work deliberately in the workspace.
    title: "Untitled Book",
    style,
    styleRevision: 0,
    manuscriptRevision: 0,
    createdAt,
  };
  const chapter: Chapter = { order: 0, title: "Chapter 1", nextSceneOrder: 0, createdAt };
  const vision: VisionDocument = {
    theme: answers.whatToWrite,
    premise: answers.roughPremise,
    characterIntents: answers.mainCharacter ? [answers.mainCharacter] : [],
    structureMap: [],
    guidanceDial: "normal",
    threads: [],
    genreProfile: normalizeGenreProfile(input.genreProfile),
    voiceProfile: normalizeVoiceProfile(input.voiceProfile),
  };

  batch.set(bookRef, book);
  batch.set(bookRef.collection("chapters").doc(), chapter);
  batch.set(bookRef.collection("vision").doc("main"), vision);

  for (const message of buildMessages(answers, style, createdAt)) {
    batch.set(bookRef.collection("messages").doc(), message);
  }

  if (input.idempotencyKey) {
    batch.set(db.collection("intakeRequests").doc(input.idempotencyKey), {
      uid,
      bookId: bookRef.id,
      createdAt,
    });
  }

  await batch.commit();

  return { bookId: bookRef.id };
}

export async function getBook(bookId: string): Promise<Book | undefined> {
  const snapshot = await firestore().collection("books").doc(bookId).get();
  if (!snapshot.exists || snapshot.data()?.deletionState === "deleting") {
    return undefined;
  }
  return snapshot.data() as Book;
}

export class NoChaptersError extends Error {
  constructor() {
    super("Book has no chapters; cannot create a next chapter.");
    this.name = "NoChaptersError";
  }
}

export async function createNextChapter(
  bookId: string,
  idempotencyKey: string,
): Promise<{ chapterId: string; order: number; prevChapterId: string }> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const requestRef = bookRef.collection("chapterRequests").doc(idempotencyKey);
  const chaptersRef = bookRef.collection("chapters");
  const newChapterRef = chaptersRef.doc();
  const systemMessageRef = bookRef.collection("messages").doc();

  return db.runTransaction(async (transaction) => {
    const [requestSnap, bookSnap, lastSnap, lastMessage] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(bookRef),
      transaction.get(chaptersRef.orderBy("order", "desc").limit(1)),
      transaction.get(bookRef.collection("messages").orderBy("order", "desc").limit(1)),
    ]);

    const existing = requestSnap.data() as
      | { chapterId?: string; order?: number; prevChapterId?: string }
      | undefined;
    if (
      requestSnap.exists &&
      typeof existing?.chapterId === "string" &&
      typeof existing.order === "number" &&
      typeof existing.prevChapterId === "string"
    ) {
      return {
        chapterId: existing.chapterId,
        order: existing.order,
        prevChapterId: existing.prevChapterId,
      };
    }

    if (!bookSnap.exists || lastSnap.empty) {
      throw new NoChaptersError();
    }

    const lastDoc = lastSnap.docs[0]!;
    const prevChapterId = lastDoc.id;
    const prevOrder = (lastDoc.data() as Chapter).order;
    const storedNextOrder = bookSnap.data()?.nextChapterOrder;
    const newOrder =
      typeof storedNextOrder === "number"
        ? Math.max(storedNextOrder, prevOrder + 1)
        : prevOrder + 1;
    const nextMessageOrder = lastMessage.empty
      ? 0
      : ((lastMessage.docs[0]?.data().order as number | undefined) ?? -1) + 1;
    const createdAt = FieldValue.serverTimestamp();

    transaction.set(newChapterRef, {
      order: newOrder,
      title: `Chapter ${newOrder + 1}`,
      nextSceneOrder: 0,
      createdAt,
    });
    transaction.update(bookRef, { nextChapterOrder: newOrder + 1 });
    transaction.set(systemMessageRef, {
      type: "system",
      text: `Chapter ${newOrder + 1} started. The previous chapter is being archived in the background.`,
      order: nextMessageOrder,
      createdAt,
    });
    transaction.set(requestRef, {
      chapterId: newChapterRef.id,
      order: newOrder,
      prevChapterId,
      createdAt,
    });

    return { chapterId: newChapterRef.id, order: newOrder, prevChapterId };
  });
}

export type OwnedBook = {
  bookId: string;
  title: string;
  style: Style;
  createdAt: unknown;
};

export async function listOwnedBooks(uid: string): Promise<OwnedBook[]> {
  const snapshot = await firestore().collection("books").where("uid", "==", uid).get();

  return snapshot.docs
    .map((doc) => {
      const book = doc.data() as Record<string, unknown>;
      const title =
        typeof book.title === "string" && book.title.trim() ? book.title.trim() : "Untitled Book";

      return {
        bookId: doc.id,
        title,
        style: normalizeStoredStyle(book.style),
        createdAt: book.createdAt,
      };
    })
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

function timestampMillis(value: unknown): number {
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  if (typeof value === "string") {
    return Date.parse(value) || 0;
  }
  return 0;
}

export async function getVisionDocument(bookId: string): Promise<VisionDocument | undefined> {
  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("vision")
    .doc("main")
    .get();
  return snapshot.exists
    ? normalizeVisionWritingProfiles(snapshot.data() as VisionDocument)
    : undefined;
}

export type VisionUpdatePatch = Pick<
  VisionDocument,
  "theme" | "premise" | "characterIntents" | "threads" | "genreProfile" | "voiceProfile"
>;

export async function updateVisionDocument(
  bookId: string,
  patch: VisionUpdatePatch,
): Promise<VisionDocument | undefined> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const visionRef = bookRef.collection("vision").doc("main");

  const existing = await visionRef.get();
  if (!existing.exists) {
    return undefined;
  }

  // appearances is system-owned (populated by future Epic 3 scene/Muse work,
  // never by the writer) — always carry forward the stored value for a
  // known thread id rather than trusting whatever the client sent.
  const existingAppearancesById = new Map(
    ((existing.data() as VisionDocument).threads ?? []).map((thread) => [
      thread.id,
      thread.appearances,
    ]),
  );
  const threads = patch.threads.map((thread) => ({
    ...thread,
    appearances: existingAppearancesById.get(thread.id) ?? [],
  }));

  const batch = db.batch();
  batch.update(visionRef, { ...patch, threads });
  batch.update(bookRef, {
    manuscriptRevision: FieldValue.increment(1),
  });
  await batch.commit();

  const snapshot = await visionRef.get();
  return snapshot.exists
    ? normalizeVisionWritingProfiles(snapshot.data() as VisionDocument)
    : undefined;
}

export async function upsertOpeningSuggestionMessage(bookId: string, text: string): Promise<void> {
  const db = firestore();
  const messages = db.collection("books").doc(bookId).collection("messages");
  const messageRef = messages.doc("opening-suggestion");

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(messageRef);

    if (existing.exists) {
      const currentOrder = existing.data()?.order;
      transaction.set(messageRef, {
        type: "structural_note",
        text,
        order: typeof currentOrder === "number" ? currentOrder : 0,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const lastMessage = await transaction.get(messages.orderBy("order", "desc").limit(1));
    const nextOrder = lastMessage.empty ? 0 : (lastMessage.docs[0]?.data().order as number) + 1;

    const message: ChatMessage = {
      type: "structural_note",
      text,
      order: nextOrder,
      createdAt: FieldValue.serverTimestamp(),
    };

    transaction.set(messageRef, message);
  });
}

type OpeningSuggestionAttemptState = "pending" | "ok" | "failed";
type OpeningSuggestionAttemptResult = {
  status: "ok" | "failed";
  openings: { text: string; rationale: string }[];
};

function openingSuggestionStateRef(bookId: string) {
  return firestore().collection("books").doc(bookId).collection("system").doc("openingSuggestion");
}

// Claims the right to run an opening-suggestion attempt, or reports the
// result of one already in flight/completed — this is the dedup guard that
// stops a retry from racing a still-running attempt (the server-side
// timeout only stops waiting on the client side, it doesn't cancel the
// underlying call) or from re-billing a model call once one already
// succeeded.
export async function claimOpeningSuggestionAttempt(
  bookId: string,
): Promise<{ shouldRun: boolean; existingResult?: OpeningSuggestionAttemptResult }> {
  const ref = openingSuggestionStateRef(bookId);

  return firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() as
      | {
          state: OpeningSuggestionAttemptState;
          openings?: OpeningSuggestionAttemptResult["openings"];
        }
      | undefined;

    if (data?.state === "ok") {
      return { shouldRun: false, existingResult: { status: "ok", openings: data.openings ?? [] } };
    }
    if (data?.state === "pending") {
      return { shouldRun: false, existingResult: { status: "failed", openings: [] } };
    }

    transaction.set(ref, { state: "pending", updatedAt: FieldValue.serverTimestamp() });
    return { shouldRun: true };
  });
}

export async function resolveOpeningSuggestionAttempt(
  bookId: string,
  status: "ok" | "failed",
  openings: OpeningSuggestionAttemptResult["openings"],
): Promise<void> {
  await openingSuggestionStateRef(bookId).set({
    state: status,
    openings,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getMessages(bookId: string): Promise<ChatMessage[]> {
  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("messages")
    .orderBy("order", "asc")
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as ChatMessage;
    return {
      id: doc.id,
      type: data.type,
      text: data.text,
      order: data.order,
      ...(data.sessionId ? { sessionId: data.sessionId } : {}),
      ...(typeof data.revision === "number" ? { revision: data.revision } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.provider ? { provider: data.provider } : {}),
      ...(data.model ? { model: data.model } : {}),
      ...(data.previousAttempt ? { previousAttempt: data.previousAttempt } : {}),
      ...(data.acceptedSceneId ? { acceptedSceneId: data.acceptedSceneId } : {}),
    };
  });
}

/**
 * Runs the last-order read and the new message write in one Firestore
 * transaction, so two concurrent calls (e.g. a double-submit) cannot both
 * read the same "last order" and write colliding order values.
 */
export async function appendChatMessage(
  bookId: string,
  type: ChatMessageType,
  text: string,
): Promise<ChatMessage> {
  const db = firestore();
  const messages = db.collection("books").doc(bookId).collection("messages");
  const newMessageRef = messages.doc();

  const message: ChatMessage = await db.runTransaction(async (transaction) => {
    const lastMessage = await transaction.get(messages.orderBy("order", "desc").limit(1));
    const nextOrder = lastMessage.empty ? 0 : (lastMessage.docs[0]?.data().order as number) + 1;

    const entry: ChatMessage = {
      type,
      text,
      order: nextOrder,
      createdAt: FieldValue.serverTimestamp(),
    };
    transaction.set(newMessageRef, entry);
    return entry;
  });

  return message;
}

export async function appendMuseConversation(
  bookId: string,
  writerMessage: string,
  museReply: string,
): Promise<{ writer: ChatMessage; muse: ChatMessage }> {
  const db = firestore();
  const messages = db.collection("books").doc(bookId).collection("messages");
  const writerRef = messages.doc();
  const museRef = messages.doc();

  return db.runTransaction(async (transaction) => {
    const lastMessage = await transaction.get(messages.orderBy("order", "desc").limit(1));
    const nextOrder = lastMessage.empty ? 0 : (lastMessage.docs[0]?.data().order as number) + 1;
    const createdAt = FieldValue.serverTimestamp();
    const writer: ChatMessage = {
      type: "user",
      text: writerMessage,
      order: nextOrder,
      createdAt,
    };
    const muse: ChatMessage = {
      type: "structural_note",
      text: museReply,
      order: nextOrder + 1,
      createdAt,
    };
    transaction.set(writerRef, writer);
    transaction.set(museRef, muse);
    return { writer, muse };
  });
}

export async function getActiveChapter(
  bookId: string,
): Promise<{ id: string; order: number } | undefined> {
  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .orderBy("order", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    return undefined;
  }
  const doc = snapshot.docs[0]!;
  const data = doc.data() as Chapter;
  return { id: doc.id, order: data.order };
}

export async function getActiveChapterScenes(
  bookId: string,
): Promise<{ chapterId: string | undefined; scenes: Scene[] }> {
  const chapter = await getActiveChapter(bookId);
  if (!chapter) {
    return { chapterId: undefined, scenes: [] };
  }

  const chapterId = chapter.id;

  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .doc(chapterId)
    .collection("scenes")
    .orderBy("order", "asc")
    .get();

  return { chapterId, scenes: snapshot.docs.map((doc) => doc.data() as Scene) };
}

export async function getPreviousChapterLastScenes(
  bookId: string,
  activeChapterOrder: number,
  limitCount = 2,
): Promise<Scene[]> {
  const db = firestore();
  const prevChapterSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .where("order", "==", activeChapterOrder - 1)
    .limit(1)
    .get();

  if (prevChapterSnap.empty) {
    return [];
  }

  const prevChapterId = prevChapterSnap.docs[0]!.id;
  const scenesSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .doc(prevChapterId)
    .collection("scenes")
    .orderBy("order", "desc")
    .limit(limitCount)
    .get();

  const scenes = scenesSnap.docs.map((doc) => doc.data() as Scene);
  return scenes.sort((a, b) => a.order - b.order);
}

export async function getPriorChapterSummaries(
  bookId: string,
  activeChapterOrder: number,
): Promise<string[]> {
  const db = firestore();
  const priorChaptersSnap = await db
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .where("order", "<", activeChapterOrder)
    .orderBy("order", "asc")
    .get();

  return priorChaptersSnap.docs
    .map((doc) => {
      const data = doc.data() as Chapter;
      return data.summary;
    })
    .filter(
      (summary): summary is string => typeof summary === "string" && summary.trim().length > 0,
    );
}

export async function retrieveRelevantFacts(
  bookId: string,
  queryVector: number[],
  limitCount = 5,
): Promise<string[]> {
  const db = firestore();
  const factsCollection = db.collection("books").doc(bookId).collection("facts");

  const snapshot = await (
    factsCollection as unknown as {
      findNearest: (options: {
        vectorField: string;
        queryVector: number[];
        distanceMeasure: string;
        limit: number;
      }) => {
        get: () => Promise<{ docs: Array<{ data: () => Record<string, unknown> | undefined }> }>;
      };
    }
  )
    .findNearest({
      vectorField: "embedding",
      queryVector,
      distanceMeasure: "COSINE",
      limit: limitCount,
    })
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return data?.description as string | undefined;
    })
    .filter(
      (desc: string | undefined): desc is string =>
        typeof desc === "string" && desc.trim().length > 0,
    );
}

export async function deleteBook(bookId: string, uid: string): Promise<void> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  await db.runTransaction(async (transaction) => {
    const bookSnap = await transaction.get(bookRef);
    if (!bookSnap.exists) {
      throw new Error("Book not found.");
    }
    const book = bookSnap.data() as Book;
    if (book.uid !== uid) {
      throw new Error("Permission denied.");
    }
    transaction.update(bookRef, {
      deletionState: "deleting",
      deletionRequestedAt: FieldValue.serverTimestamp(),
    });
  });

  const intakeRequests = await db.collection("intakeRequests").where("bookId", "==", bookId).get();
  await Promise.all(intakeRequests.docs.map((doc) => db.recursiveDelete(doc.ref)));

  await getStorage()
    .bucket()
    .deleteFiles({ prefix: `exports/${bookId}-` });
  await db.recursiveDelete(bookRef);
}

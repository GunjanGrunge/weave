import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { Book, Style } from "../types/book.js";
import type { Chapter } from "../types/chapter.js";
import type { ChatMessage, ChatMessageType } from "../types/chatMessage.js";
import type { Scene } from "../types/scene.js";
import type { VisionDocument } from "../types/vision.js";
import {
  getStyleCatalog,
  normalizeStoredStyle as normalizeCanonicalStoredStyle,
  parseStyleInput,
} from "./styles.js";

const STYLE_CATALOG = getStyleCatalog();
const STYLE_PRESETS = STYLE_CATALOG.presets;

export type PremiseAnswers = {
  whatToWrite?: string;
  mainCharacter?: string;
  roughPremise?: string;
};

export type CreateBookInput = {
  premiseAnswers: PremiseAnswers;
  style: Style;
  idempotencyKey?: string;
};

const intakePrompts = [
  { key: "whatToWrite", text: "What do you want to write?" },
  { key: "mainCharacter", text: "Who is the main character?" },
  { key: "roughPremise", text: "What is the rough premise?" },
] as const;

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

function styleSummary(style: Style): string {
  const labels = style.presetIds.map(
    (id) => STYLE_PRESETS.find((preset) => preset.id === id)?.label ?? id,
  );
  const presetText = labels.length > 0 ? labels.join(" + ") : "Default style";
  return style.customInstruction
    ? `${presetText}. Custom instruction: ${style.customInstruction}`
    : presetText;
}

function buildMessages(
  answers: Required<PremiseAnswers>,
  style: Style,
  createdAt: unknown,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const prompt of intakePrompts) {
    messages.push({
      type: "system",
      text: prompt.text,
      order: messages.length,
      createdAt,
    });
    messages.push({
      type: "user",
      text: answers[prompt.key] || "(skipped)",
      order: messages.length,
      createdAt,
    });
  }

  messages.push({
    type: "system",
    text: "Choose a starting style.",
    order: messages.length,
    createdAt,
  });
  messages.push({
    type: "user",
    text: styleSummary(style),
    order: messages.length,
    createdAt,
  });

  return messages;
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
    title: answers.whatToWrite || "Untitled Book",
    style,
    styleRevision: 0,
    manuscriptRevision: 0,
    createdAt,
  };
  const chapter: Chapter = { order: 0, nextSceneOrder: 0, createdAt };
  const vision: VisionDocument = {
    theme: answers.whatToWrite,
    premise: answers.roughPremise,
    characterIntents: answers.mainCharacter ? [answers.mainCharacter] : [],
    structureMap: [],
    guidanceDial: "normal",
    threads: [],
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
  return snapshot.exists ? (snapshot.data() as Book) : undefined;
}

export class NoChaptersError extends Error {
  constructor() {
    super("Book has no chapters; cannot create a next chapter.");
    this.name = "NoChaptersError";
  }
}

export async function createNextChapter(
  bookId: string,
): Promise<{ chapterId: string; order: number; prevChapterId: string }> {
  const db = firestore();

  return db.runTransaction(async (transaction) => {
    // Get the current last chapter (highest order value)
    const chaptersRef = db.collection("books").doc(bookId).collection("chapters");
    const lastSnap = await transaction.get(
      chaptersRef.orderBy("order", "desc").limit(1),
    );

    if (lastSnap.empty) {
      throw new NoChaptersError();
    }

    const lastDoc = lastSnap.docs[0]!;
    const prevChapterId = lastDoc.id;
    const prevOrder = (lastDoc.data() as Chapter).order;
    const newOrder = prevOrder + 1;

    const newChapterRef = chaptersRef.doc();
    transaction.set(newChapterRef, {
      order: newOrder,
      nextSceneOrder: 0,
      createdAt: FieldValue.serverTimestamp(),
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
  return snapshot.exists ? (snapshot.data() as VisionDocument) : undefined;
}

export type VisionUpdatePatch = Pick<
  VisionDocument,
  "theme" | "premise" | "characterIntents" | "threads"
>;

export async function updateVisionDocument(
  bookId: string,
  patch: VisionUpdatePatch,
): Promise<VisionDocument | undefined> {
  const visionRef = firestore().collection("books").doc(bookId).collection("vision").doc("main");

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

  await visionRef.update({ ...patch, threads });

  const snapshot = await visionRef.get();
  return snapshot.exists ? (snapshot.data() as VisionDocument) : undefined;
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

async function getActiveChapterId(bookId: string): Promise<string | undefined> {
  const snapshot = await firestore()
    .collection("books")
    .doc(bookId)
    .collection("chapters")
    .orderBy("order", "desc")
    .limit(1)
    .get();

  return snapshot.empty ? undefined : snapshot.docs[0]?.id;
}

export async function getActiveChapterScenes(
  bookId: string,
): Promise<{ chapterId: string | undefined; scenes: Scene[] }> {
  const chapterId = await getActiveChapterId(bookId);
  if (!chapterId) {
    return { chapterId: undefined, scenes: [] };
  }

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

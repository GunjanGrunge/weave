import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { DEFAULT_STYLE_PRESET_ID, STYLE_PRESETS } from "../config/stylePresets.js";
import type { Book, Style } from "../types/book.js";
import type { Chapter } from "../types/chapter.js";
import type { ChatMessage } from "../types/chatMessage.js";
import type { VisionDocument } from "../types/vision.js";

export type PremiseAnswers = {
  whatToWrite?: string;
  mainCharacter?: string;
  roughPremise?: string;
};

export type CreateBookInput = {
  premiseAnswers: PremiseAnswers;
  style: Style;
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
  const knownIds = new Set(STYLE_PRESETS.map((preset) => preset.id));
  const presetIds = [...new Set(style.presetIds.filter((id) => knownIds.has(id)))].slice(0, 2);
  const normalizedPresetIds = presetIds.length > 0 ? presetIds : [DEFAULT_STYLE_PRESET_ID];
  const customInstruction = clean(style.customInstruction);

  return customInstruction
    ? { presetIds: normalizedPresetIds, customInstruction }
    : { presetIds: normalizedPresetIds };
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
    createdAt,
  };
  const chapter: Chapter = { order: 0, createdAt };
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

  await batch.commit();

  return { bookId: bookRef.id };
}

export async function getBook(bookId: string): Promise<Book | undefined> {
  const snapshot = await firestore().collection("books").doc(bookId).get();
  return snapshot.exists ? (snapshot.data() as Book) : undefined;
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

export async function appendStructuralNoteMessage(bookId: string, text: string): Promise<void> {
  const messages = firestore().collection("books").doc(bookId).collection("messages");
  const lastMessage = await messages.orderBy("order", "desc").limit(1).get();
  const nextOrder = lastMessage.empty ? 0 : (lastMessage.docs[0]?.data().order as number) + 1;

  const message: ChatMessage = {
    type: "structural_note",
    text,
    order: nextOrder,
    createdAt: FieldValue.serverTimestamp(),
  };

  await messages.doc().set(message);
}

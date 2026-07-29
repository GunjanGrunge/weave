import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  type FirestoreEvent,
  type QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import {
  callWithFallback,
  readModelRegistry,
  recordUsageBestEffort,
} from "../services/gemini.js";
import type { Chapter } from "../types/chapter.js";
import type { Scene } from "../types/scene.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

function buildSummaryPrompt(chapterText: string): string {
  return [
    "You are a story editor creating a compact memory note for an ongoing novel.",
    "Summarize the following chapter for use as context in future scene generations.",
    "Include: key events, character decisions, new information revealed, and any unresolved tensions.",
    "Keep the summary under 300 words. Write in present tense.",
    "",
    "Chapter text:",
    chapterText,
  ].join("\n");
}

export async function handleChapterCreate(
  event: FirestoreEvent<
    QueryDocumentSnapshot | undefined,
    { bookId: string; chapterId: string }
  >,
): Promise<void> {
  const snap = event.data;
  if (!snap) {
    console.log("No chapter document snapshot available.");
    return;
  }

  const { bookId } = event.params;
  const newChapterData = snap.data() as Chapter;
  const newOrder = newChapterData.order;

  // First chapter — no previous chapter to summarize
  if (newOrder === 0) {
    console.log("First chapter created; no previous chapter to summarize.");
    return;
  }

  const db = firestore();

  try {
    // Find the previous chapter by order
    const prevSnap = await db
      .collection("books")
      .doc(bookId)
      .collection("chapters")
      .where("order", "==", newOrder - 1)
      .limit(1)
      .get();

    if (prevSnap.empty) {
      console.log(`No chapter found with order ${newOrder - 1} for book ${bookId}. Skipping.`);
      return;
    }

    const prevDoc = prevSnap.docs[0]!;
    const prevChapterId = prevDoc.id;
    const prevChapterData = prevDoc.data() as Chapter;

    // Idempotency guard — exit if summary already exists
    if (prevChapterData.summary && prevChapterData.summary.length > 0) {
      console.log(`Chapter ${prevChapterId} already has a summary. Skipping.`);
      return;
    }

    const prevChapterRef = db
      .collection("books")
      .doc(bookId)
      .collection("chapters")
      .doc(prevChapterId);

    // Fetch all accepted scenes from the previous chapter
    const scenesSnap = await prevChapterRef
      .collection("scenes")
      .orderBy("order", "asc")
      .get();

    // No scenes — write a placeholder without calling Gemini
    if (scenesSnap.empty) {
      await prevChapterRef.update({
        summary: "(No scenes accepted in this chapter.)",
        summarizedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Chapter ${prevChapterId} had no scenes; wrote placeholder summary.`);
      return;
    }

    const scenes = scenesSnap.docs.map((doc) => doc.data() as Scene);
    const chapterText = scenes
      .map((s) => (typeof s.text === "string" ? s.text : ""))
      .filter((t) => t.length > 0)
      .join("\n\n");

    const prompt = buildSummaryPrompt(chapterText);
    const registry = await readModelRegistry();
    const apiKeys = {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    };

    const result = await callWithFallback(registry.chapterSummary, apiKeys, prompt);
    const summaryText = result.text?.trim() ?? "(Summary unavailable.)";

    await prevChapterRef.update({
      summary: summaryText,
      summarizedAt: FieldValue.serverTimestamp(),
    });

    await recordUsageBestEffort(bookId, "chapterSummary", result);

    console.log(`Successfully summarized chapter ${prevChapterId} for book ${bookId}.`);
  } catch (error) {
    // Fail silently — summarization is background infrastructure, never user-blocking
    console.error(`Chapter summarization failed for book ${bookId}:`, error);
  }
}

export const summarizePreviousChapter = onDocumentCreated(
  {
    document: "books/{bookId}/chapters/{chapterId}",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
    region: "us-central1",
    timeoutSeconds: 540,
  },
  (event) => handleChapterCreate(event),
);

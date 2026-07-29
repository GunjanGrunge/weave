import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  type FirestoreEvent,
  type QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import {
  claimAutomationTask,
  completeAutomationTask,
  failAutomationTask,
} from "../services/automation.js";
import { callWithFallback, readModelRegistry, recordUsageBestEffort } from "../services/gemini.js";
import type { Chapter } from "../types/chapter.js";
import type { ChatMessage } from "../types/chatMessage.js";
import type { VisionDocument } from "../types/vision.js";
import { composeWritingProfileInstruction } from "../services/writingProfiles.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

const MUSE_NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    beat: { type: "string" },
    structuralNote: { type: "string" },
  },
  required: ["beat", "structuralNote"],
};

function buildMusePrompt(
  premise: string,
  theme: string,
  structureMap: Array<{ beat: string; sceneRef: string }>,
  priorChapterSummaries: string[],
  sceneText: string,
  writingProfileInstruction = "",
): string {
  const mapText =
    structureMap && structureMap.length > 0
      ? structureMap.map((b) => `- Beat: "${b.beat}" (Scene: ${b.sceneRef})`).join("\n")
      : "(No beats recorded yet)";

  const summariesText =
    priorChapterSummaries && priorChapterSummaries.length > 0
      ? priorChapterSummaries.map((s, idx) => `Chapter ${idx + 1} Summary: ${s}`).join("\n")
      : "(No prior chapters)";

  return [
    "You are a developmental editor analyzing a novel-in-progress to help the author maintain structure and momentum.",
    writingProfileInstruction,
    "",
    "Book Premise:",
    premise || "(Not specified)",
    "",
    "Book Theme:",
    theme || "(Not specified)",
    "",
    "Structure Map (Existing Beats):",
    mapText,
    "",
    "Prior Chapter Summaries:",
    summariesText,
    "",
    "Newly Accepted Scene Text:",
    `"""\n${sceneText}\n"""`,
    "",
    "CRITICAL TASK:",
    "Analyze the newly accepted scene text in relation to the premise, theme, and previous structure map/chapter summaries.",
    "1. Identify the likely narrative/structural beat that this scene represents (e.g. Inciting Incident, Rising Action, Climax, Resolution, or a custom beat). Keep the beat name brief (max 3 words).",
    "2. Suggest the next logical beat/direction for the story with a concise one-line rationale ('why'). Keep the suggested direction and rationale focused on pacing and tension.",
    "3. Return the response strictly as a JSON object matching the requested schema. Do NOT add conversational filler, markdown block quotes, or extra text outside the JSON.",
  ].join("\n");
}

export async function handleSceneAcceptForMuse(
  event: FirestoreEvent<
    QueryDocumentSnapshot | undefined,
    { bookId: string; chapterId: string; sceneId: string }
  >,
): Promise<void> {
  const snap = event.data;
  if (!snap) {
    console.log("No scene document snapshot available.");
    return;
  }

  const { bookId, chapterId, sceneId } = event.params;
  const sceneData = snap.data();
  if (typeof sceneData?.restoredFromSnapshot === "string") {
    console.log("Restored scene detected. Skipping Muse note generation.");
    return;
  }
  const sceneText = sceneData?.text;

  if (!sceneText || typeof sceneText !== "string" || sceneText.trim() === "") {
    console.log("Scene text is empty. Skipping Muse note generation.");
    return;
  }

  const db = firestore();
  const taskId = `muse-${chapterId}-${sceneId}`;
  let claimed = false;

  try {
    claimed = await claimAutomationTask(bookId, taskId);
    if (!claimed) {
      console.log("Muse note already claimed for this scene.");
      return;
    }

    // 1. Fetch Vision document
    const visionRef = db.collection("books").doc(bookId).collection("vision").doc("main");
    const visionSnap = await visionRef.get();
    const visionData = visionSnap.exists ? (visionSnap.data() as VisionDocument) : undefined;

    const premise = visionData?.premise || "";
    const theme = visionData?.theme || "";
    const structureMap = visionData?.structureMap || [];

    // 2. Fetch prior chapter summaries
    const chapterRef = db.collection("books").doc(bookId).collection("chapters").doc(chapterId);
    const chapterSnap = await chapterRef.get();
    const activeChapterOrder = chapterSnap.exists ? (chapterSnap.data() as Chapter).order : 0;

    const priorChaptersSnap = await db
      .collection("books")
      .doc(bookId)
      .collection("chapters")
      .where("order", "<", activeChapterOrder)
      .orderBy("order", "asc")
      .get();

    const priorChapterSummaries = priorChaptersSnap.docs
      .map((doc) => (doc.data() as Chapter).summary)
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);

    // 3. Compose prompt and call registry-pinned model
    const prompt = buildMusePrompt(
      premise,
      theme,
      structureMap,
      priorChapterSummaries,
      sceneText,
      visionData ? composeWritingProfileInstruction(visionData) : "",
    );
    const registry = await readModelRegistry();
    const apiKeys = {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    };

    const museResult = await callWithFallback(registry.museNote, apiKeys, prompt, {
      name: "generate_muse_note",
      schema: MUSE_NOTE_SCHEMA,
    });

    await recordUsageBestEffort(bookId, "museNote", museResult);

    if (!museResult.text) {
      console.log("Muse model response had no text.");
      return;
    }

    const parsed = JSON.parse(museResult.text.trim()) as {
      beat?: string;
      structuralNote?: string;
    };

    const beat = parsed.beat?.trim();
    const structuralNote = parsed.structuralNote?.trim();

    if (!beat || !structuralNote) {
      console.log("Parsed Muse response is missing beat or structuralNote.");
      return;
    }

    // 4. Atomically append the deterministic note and structure-map entry.
    await db.runTransaction(async (transaction) => {
      const messagesRef = db.collection("books").doc(bookId).collection("messages");
      const messageRef = messagesRef.doc(`muse-${chapterId}-${sceneId}`);
      const [existingMessage, lastMessageSnap] = await Promise.all([
        transaction.get(messageRef),
        transaction.get(messagesRef.orderBy("order", "desc").limit(1)),
      ]);
      if (existingMessage.exists) {
        return;
      }
      const nextOrder = lastMessageSnap.empty
        ? 0
        : ((lastMessageSnap.docs[0]?.data().order as number | undefined) ?? -1) + 1;

      const message: ChatMessage = {
        type: "structural_note",
        text: structuralNote,
        order: nextOrder,
      };

      transaction.set(messageRef, {
        ...message,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(visionRef, {
        structureMap: FieldValue.arrayUnion({
          beat,
          sceneRef: `chapters/${chapterId}/scenes/${sceneId}`,
        }),
      });
    });
    await completeAutomationTask(bookId, taskId);

    console.log(`Successfully generated Muse note and updated Structure Map for scene ${sceneId}.`);
  } catch (error) {
    // Fail silently — Muse note generation is background guidance, never user-blocking
    console.error(`Muse note generation failed for book ${bookId}:`, error);
    if (claimed) {
      await failAutomationTask(
        bookId,
        taskId,
        error instanceof Error ? error.message : "Unknown Muse failure.",
      ).catch((claimError) => {
        console.error("Failed to record Muse automation state:", claimError);
      });
    }
  }
}

export const generateMuseNoteOnSceneAccept = onDocumentCreated(
  {
    document: "books/{bookId}/chapters/{chapterId}/scenes/{sceneId}",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
    region: "asia-south1",
    timeoutSeconds: 540,
  },
  (event) => handleSceneAcceptForMuse(event),
);

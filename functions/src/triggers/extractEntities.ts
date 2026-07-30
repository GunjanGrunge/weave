import { createHash } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  onDocumentWritten,
  type FirestoreEvent,
  type QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import {
  claimAutomationTask,
  completeAutomationTask,
  failAutomationTask,
} from "../services/automation.js";
import { readModelRegistry, callWithFallback, recordUsageBestEffort } from "../services/gemini.js";
import {
  characterIdForName,
  markStoryBibleStale,
  reconcileStoryBibleSource,
  storyBibleExtractionTaskId,
} from "../services/storyBible.js";
import type {
  ExtractedCharacterEvidence,
  ExtractedCharacterValue,
  ExtractedTimelineEvent,
  TemporalContext,
} from "../types/storyBible.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["character", "location", "fact", "other"] },
          description: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          stableTraits: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                value: { type: "string" },
                excerpt: { type: "string" },
              },
              required: ["field", "value", "excerpt"],
            },
          },
          currentState: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                value: { type: "string" },
                excerpt: { type: "string" },
              },
              required: ["field", "value", "excerpt"],
            },
          },
          timelineEvents: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                chronology: {
                  type: "string",
                  enum: ["present", "historical", "ambiguous"],
                },
                excerpt: { type: "string" },
              },
              required: ["label", "description", "chronology", "excerpt"],
            },
          },
          temporalContext: {
            type: "string",
            enum: ["present", "historical", "ambiguous"],
          },
        },
        required: [
          "name",
          "type",
          "description",
          "aliases",
          "stableTraits",
          "currentState",
          "timelineEvents",
          "temporalContext",
        ],
      },
    },
  },
  required: ["entities"],
};

type ExtractedEntity = {
  name: string;
  type: string;
  description: string;
  aliases?: unknown;
  stableTraits?: unknown;
  currentState?: unknown;
  timelineEvents?: unknown;
  temporalContext?: unknown;
};

type SceneEventData = {
  before?: QueryDocumentSnapshot;
  after?: QueryDocumentSnapshot;
};

function sceneSnapshots(eventData: unknown): SceneEventData {
  if (
    typeof eventData === "object" &&
    eventData !== null &&
    "before" in eventData &&
    "after" in eventData
  ) {
    const change = eventData as {
      before?: QueryDocumentSnapshot;
      after?: QueryDocumentSnapshot;
    };
    return {
      before: change.before?.exists ? change.before : undefined,
      after: change.after?.exists ? change.after : undefined,
    };
  }
  return eventData ? { after: eventData as QueryDocumentSnapshot } : {};
}

function extractedValues(value: unknown): ExtractedCharacterValue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Record<string, unknown>;
    return typeof item.field === "string" && typeof item.value === "string"
      ? [
          {
            field: item.field.trim().slice(0, 80),
            value: item.value.trim().slice(0, 500),
            excerpt:
              typeof item.excerpt === "string" ? item.excerpt.trim().slice(0, 500) : "",
          },
        ]
      : [];
  });
}

function timelineEvents(value: unknown): ExtractedTimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as Record<string, unknown>;
    const chronology =
      item.chronology === "present" ||
      item.chronology === "historical" ||
      item.chronology === "ambiguous"
        ? item.chronology
        : "ambiguous";
    return typeof item.label === "string" && typeof item.description === "string"
      ? [
          {
            label: item.label.trim().slice(0, 160),
            description: item.description.trim().slice(0, 1_000),
            chronology,
            excerpt:
              typeof item.excerpt === "string" ? item.excerpt.trim().slice(0, 500) : "",
          },
        ]
      : [];
  });
}

function characterEvidence(entity: ExtractedEntity): ExtractedCharacterEvidence {
  const temporalContext: TemporalContext =
    entity.temporalContext === "historical" ||
    entity.temporalContext === "ambiguous" ||
    entity.temporalContext === "present"
      ? entity.temporalContext
      : "present";
  return {
    characterKey: characterIdForName(entity.name),
    name: entity.name.trim().slice(0, 160),
    summary: entity.description.trim().slice(0, 2_000),
    aliases: Array.isArray(entity.aliases)
      ? entity.aliases
          .filter((alias): alias is string => typeof alias === "string")
          .slice(0, 50)
          .map((alias) => alias.trim().slice(0, 160))
      : [],
    stableTraits: extractedValues(entity.stableTraits),
    currentState: extractedValues(entity.currentState),
    timelineEvents: timelineEvents(entity.timelineEvents),
    temporalContext,
  };
}

export async function handleSceneAccept(
  event: FirestoreEvent<unknown, { bookId: string; chapterId: string; sceneId: string }>,
) {
  const { bookId, chapterId, sceneId } = event.params;
  let claimed = false;
  let taskId = "";
  const snapshots = sceneSnapshots(event.data);
  const snap = snapshots.after;

  try {
    if (!snap) {
      const beforeText = snapshots.before?.data()?.text;
      if (typeof beforeText === "string" && beforeText) {
        await firestore()
          .collection("books")
          .doc(bookId)
          .collection("automation")
          .doc(storyBibleExtractionTaskId(chapterId, sceneId, beforeText))
          .delete();
      }
      await reconcileStoryBibleSource(bookId, undefined, { chapterId, sceneId });
      return;
    }
    const sceneData = snap.data();
    const sceneText = sceneData?.text;
    if (!sceneText || typeof sceneText !== "string" || sceneText.trim() === "") {
      await reconcileStoryBibleSource(bookId, undefined, { chapterId, sceneId });
      return;
    }
    const textHash = createHash("sha256").update(sceneText).digest("hex");
    const db = firestore();
    const chapterRef = db
      .collection("books")
      .doc(bookId)
      .collection("chapters")
      .doc(chapterId);
    const chapter = await chapterRef.get();
    const chapterOrder =
      typeof chapter.data()?.order === "number" ? (chapter.data()?.order as number) : 0;
    const sceneOrder = typeof sceneData.order === "number" ? sceneData.order : 0;
    const rebuildRequestId =
      typeof sceneData.storyBibleRebuildRequestId === "string"
        ? sceneData.storyBibleRebuildRequestId
        : undefined;
    const beforeText = snapshots.before?.data()?.text;
    if (typeof beforeText === "string" && beforeText !== sceneText) {
      await firestore()
        .collection("books")
        .doc(bookId)
        .collection("automation")
        .doc(storyBibleExtractionTaskId(chapterId, sceneId, beforeText))
        .delete();
    }
    taskId = storyBibleExtractionTaskId(
      chapterId,
      sceneId,
      sceneText,
      `${chapterOrder}:${sceneOrder}:${rebuildRequestId ?? ""}`,
    );
    claimed = await claimAutomationTask(bookId, taskId);
    if (!claimed) {
      console.log("Entity extraction already claimed for this scene.");
      return;
    }

    const apiKeys = {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    };

    const registry = await readModelRegistry();

    // Step 1: Prompt model to extract entities explicitly mentioned in scene text
    const extractionPrompt = [
      "You are an expert fact extractor for a creative writing platform.",
      "Your task is to analyze the following scene manuscript text and extract all key entities (characters, locations, key facts) explicitly mentioned in it.",
      "",
      "CRITICAL RULES:",
      "1. Extract ONLY facts that are explicitly written in the scene text. Do not make assumptions, project future events, or invent hidden subtexts.",
      "2. Do NOT speculate or interpret hidden meanings (e.g. if a character is crying, record that they are crying, do not speculate on their unstated psychological trauma).",
      "3. Keep entity names precise and consistent (e.g. 'Elena', 'The Crimson Inn').",
      "4. Provide a clear, concise description summarizing what is learned about each entity in this specific scene.",
      "5. For every character, return aliases, stable traits (age, appearance, identity), current state (location, occupation, health, relationships), and timeline events with a short exact-text excerpt as evidence.",
      "6. Mark temporalContext historical for explicit flashbacks or remembered younger states. Mark ambiguous when chronology cannot be established. Historical evidence must not be presented as current state.",
      "7. Use empty structured arrays for non-character entities and when the scene provides no such character detail.",
      "8. If no entities are found, return an empty array for 'entities'.",
      "",
      `Scene Manuscript Text:\n"""\n${sceneText}\n"""`,
    ].join("\n");

    const extractionResult = await callWithFallback(
      registry.entityExtraction,
      apiKeys,
      extractionPrompt,
      {
        name: "extract_entities",
        schema: EXTRACTION_SCHEMA,
      },
    );

    await recordUsageBestEffort(bookId, "entityExtraction", extractionResult);

    if (!extractionResult.text) {
      throw new Error("Entity extraction returned an empty response.");
    }

    const parsed = JSON.parse(extractionResult.text) as { entities?: ExtractedEntity[] };

    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];

    if (snap.ref?.get) {
      const [liveScene, liveChapter] = await Promise.all([snap.ref.get(), chapterRef.get()]);
      const liveData = liveScene.data();
      const liveRebuildRequestId =
        typeof liveData?.storyBibleRebuildRequestId === "string"
          ? liveData.storyBibleRebuildRequestId
          : undefined;
      if (
        !liveScene.exists ||
        liveData?.text !== sceneText ||
        (typeof liveData?.order === "number" ? liveData.order : 0) !== sceneOrder ||
        (typeof liveChapter.data()?.order === "number" ? liveChapter.data()?.order : 0) !==
          chapterOrder ||
        liveRebuildRequestId !== rebuildRequestId
      ) {
        console.log("Discarding obsolete entity extraction for a changed scene.");
        await failAutomationTask(bookId, taskId, "Scene changed during entity extraction.");
        return;
      }
    }

    await reconcileStoryBibleSource(
      bookId,
      {
        chapterId,
        sceneId,
        chapterOrder,
        sceneOrder,
        textHash,
        rebuildRequestId,
        characters: entities
          .filter((entity) => entity.type === "character" && entity.name.trim())
          .map(characterEvidence),
      },
      { chapterId, sceneId, rebuildRequestId },
    );

    const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });

    // Semantic facts are best-effort; canonical character memory has already committed.
    for (const entity of entities) {
      try {
      const normalizedName = entity.name.trim().toLowerCase();
      const slug = normalizedName
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);
      const nameHash = createHash("sha256").update(normalizedName).digest("hex").slice(0, 12);
      const sanitizedId = `${slug || "entity"}-${nameHash}`;

      if (!normalizedName) {
        continue;
      }

      const factRef = db.collection("books").doc(bookId).collection("facts").doc(sanitizedId);
      let committed = false;
      let displayName = entity.name;
      for (let mergeAttempt = 0; mergeAttempt < 3 && !committed; mergeAttempt += 1) {
        const factSnap = await factRef.get();
        const existingData = factSnap.data();
        const existingDescription =
          typeof existingData?.description === "string" ? existingData.description : "";
        const existingVersion =
          typeof existingData?.version === "number" ? existingData.version : 0;
        displayName = typeof existingData?.name === "string" ? existingData.name : entity.name;
        let finalDescription = entity.description.trim();

        if (factSnap.exists) {
          const mergePrompt = [
            `You are an editor merging new details into an existing reference profile for the entity '${displayName}'.`,
            "",
            "Existing Profile Description:",
            `"""\n${existingDescription}\n"""`,
            "",
            "New Information from Scene:",
            `"""\n${entity.description}\n"""`,
            "",
            "Instructions:",
            "- Merge the new details into the existing description to produce a single, cohesive, up-to-date summary.",
            "- Preserve all established historical details unless they are explicitly contradicted.",
            "- Resolve any formatting or phrasing to be clear and concise.",
            "- Write in third-person present tense.",
            "- Output ONLY the final merged description text. Do NOT wrap it in markdown block quotes, code fences, or add any intro/outro conversational text.",
          ].join("\n");

          const mergeResult = await callWithFallback(
            registry.entityExtraction,
            apiKeys,
            mergePrompt,
          );
          await recordUsageBestEffort(bookId, "entityExtraction", mergeResult);
          if (mergeResult.text) {
            finalDescription = mergeResult.text.trim();
          }
        }

        const embedResponse = await ai.models.embedContent({
          model: registry.embedding.model,
          contents: finalDescription,
          config: {
            outputDimensionality: registry.embedding.outputDimensionality,
          },
        });

        const embeddingValues = embedResponse.embeddings?.[0]?.values;
        if (!embeddingValues || !Array.isArray(embeddingValues)) {
          throw new Error(`Failed to generate embedding vector for entity: ${displayName}`);
        }

        const embedMeta = (embedResponse as { usageMetadata?: { promptTokenCount?: number } })
          .usageMetadata;
        await recordUsageBestEffort(bookId, "embedding", {
          text: "",
          provider: "gemini",
          model: registry.embedding.model,
          inputTokens:
            embedMeta?.promptTokenCount ?? Math.max(1, Math.ceil(finalDescription.length / 4)),
          outputTokens: 0,
        });

        committed = await db.runTransaction(async (transaction) => {
          const current = await transaction.get(factRef);
          const currentData = current.data();
          const currentVersion = typeof currentData?.version === "number" ? currentData.version : 0;
          const currentDescription =
            typeof currentData?.description === "string" ? currentData.description : "";
          if (
            current.exists !== factSnap.exists ||
            currentVersion !== existingVersion ||
            currentDescription !== existingDescription
          ) {
            return false;
          }
          transaction.set(factRef, {
            name: displayName,
            normalizedName,
            type: entity.type,
            description: finalDescription,
            embedding: embeddingValues,
            version: existingVersion + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      }

      if (!committed) {
        throw new Error(`Entity profile changed repeatedly: ${displayName}`);
      }
      console.log(`Successfully processed and upserted fact: ${displayName}`);
      } catch (error) {
        console.error("Optional semantic fact processing failed:", {
          bookId,
          entity: entity.name,
          error,
        });
      }
    }
    await completeAutomationTask(bookId, taskId);
  } catch (error) {
    console.error("Failed silently during background entity extraction:", error);
    await markStoryBibleStale(bookId, "stale", { chapterId, sceneId }).catch((stateError) => {
      console.error("Failed to mark Story Bible stale:", stateError);
    });
    if (claimed) {
      await failAutomationTask(
        bookId,
        taskId,
        error instanceof Error ? error.message : "Unknown extraction failure.",
      ).catch((claimError) => {
        console.error("Failed to record entity extraction state:", claimError);
      });
    }
  }
}

export const extractEntitiesOnSceneAccept = onDocumentWritten(
  {
    document: "books/{bookId}/chapters/{chapterId}/scenes/{sceneId}",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
    region: "asia-south1",
  },
  handleSceneAccept,
);

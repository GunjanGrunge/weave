import { createHash } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, type FirestoreEvent, type QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import {
  claimAutomationTask,
  completeAutomationTask,
  failAutomationTask,
} from "../services/automation.js";
import { readModelRegistry, callWithFallback, recordUsageBestEffort } from "../services/gemini.js";

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
          description: { type: "string" }
        },
        required: ["name", "type", "description"]
      }
    }
  },
  required: ["entities"]
};

export async function handleSceneAccept(
  event: FirestoreEvent<QueryDocumentSnapshot | undefined, { bookId: string; chapterId: string; sceneId: string }>
) {
  const { bookId, chapterId, sceneId } = event.params;
  const taskId = `entities-${chapterId}-${sceneId}`;
  let claimed = false;
    const snap = event.data;
    if (!snap) {
      console.log("No scene document snapshot available.");
      return;
    }

    try {
      const sceneData = snap.data();
      if (typeof sceneData?.restoredFromSnapshot === "string") {
        console.log("Restored scene detected. Skipping entity extraction.");
        return;
      }
      const sceneText = sceneData?.text;
      if (!sceneText || typeof sceneText !== "string" || sceneText.trim() === "") {
        console.log("Scene text is empty. Skipping extraction.");
        return;
      }
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
        "5. If no entities are found, return an empty array for 'entities'.",
        "",
        `Scene Manuscript Text:\n"""\n${sceneText}\n"""`
      ].join("\n");

      const extractionResult = await callWithFallback(
        registry.entityExtraction,
        apiKeys,
        extractionPrompt,
        {
          name: "extract_entities",
          schema: EXTRACTION_SCHEMA,
        }
      );

      await recordUsageBestEffort(bookId, "entityExtraction", extractionResult);

      if (!extractionResult.text) {
        console.log("Extraction response had no text.");
        await completeAutomationTask(bookId, taskId);
        return;
      }

      const parsed = JSON.parse(extractionResult.text) as {
        entities?: Array<{ name: string; type: string; description: string }>;
      };

      const entities = parsed.entities || [];
      if (entities.length === 0) {
        console.log("No entities extracted from scene.");
        await completeAutomationTask(bookId, taskId);
        return;
      }

      const db = firestore();
      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });

      // Step 2: Merge, Embed, and Upsert each entity
      for (const entity of entities) {
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
          displayName =
            typeof existingData?.name === "string" ? existingData.name : entity.name;
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

          const embedMeta = (
            embedResponse as { usageMetadata?: { promptTokenCount?: number } }
          ).usageMetadata;
          await recordUsageBestEffort(bookId, "embedding", {
            text: "",
            provider: "gemini",
            model: registry.embedding.model,
            inputTokens:
              embedMeta?.promptTokenCount ??
              Math.max(1, Math.ceil(finalDescription.length / 4)),
            outputTokens: 0,
          });

          committed = await db.runTransaction(async (transaction) => {
            const current = await transaction.get(factRef);
            const currentData = current.data();
            const currentVersion =
              typeof currentData?.version === "number" ? currentData.version : 0;
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
      }
      await completeAutomationTask(bookId, taskId);
    } catch (error) {
      console.error("Failed silently during background entity extraction:", error);
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

export const extractEntitiesOnSceneAccept = onDocumentCreated(
  {
    document: "books/{bookId}/chapters/{chapterId}/scenes/{sceneId}",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
    region: "asia-south1",
  },
  handleSceneAccept
);

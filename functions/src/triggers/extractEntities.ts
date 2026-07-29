import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, type FirestoreEvent, type QueryDocumentSnapshot } from "firebase-functions/v2/firestore";
import { GoogleGenAI } from "@google/genai";

import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
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
  const { bookId } = event.params;
    const snap = event.data;
    if (!snap) {
      console.log("No scene document snapshot available.");
      return;
    }

    try {
      const sceneData = snap.data();
      const sceneText = sceneData?.text;
      if (!sceneText || typeof sceneText !== "string" || sceneText.trim() === "") {
        console.log("Scene text is empty. Skipping extraction.");
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
        return;
      }

      const parsed = JSON.parse(extractionResult.text) as {
        entities?: Array<{ name: string; type: string; description: string }>;
      };

      const entities = parsed.entities || [];
      if (entities.length === 0) {
        console.log("No entities extracted from scene.");
        return;
      }

      const db = firestore();
      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });

      // Step 2: Merge, Embed, and Upsert each entity
      for (const entity of entities) {
        const sanitizedId = entity.name
          .trim()
          .toLowerCase()
          .replace(new RegExp("[/\\s.#$\\[\\]]+", "g"), "_");

        if (!sanitizedId) {
          continue;
        }

        const factRef = db.collection("books").doc(bookId).collection("facts").doc(sanitizedId);
        const factSnap = await factRef.get();

        let finalDescription = entity.description.trim();
        const displayName = factSnap.exists ? (factSnap.data()?.name || entity.name) : entity.name;

        if (factSnap.exists) {
          const existingData = factSnap.data();
          const existingDescription = existingData?.description || "";

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
            mergePrompt
          );

          await recordUsageBestEffort(bookId, "entityExtraction", mergeResult);

          if (mergeResult.text) {
            finalDescription = mergeResult.text.trim();
          }
        }

        // Generate embedding vector for the combined description
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

        // Record embedding API usage
        let embedInputTokens = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const embedMeta = (embedResponse as any).usageMetadata;
        if (embedMeta?.promptTokenCount) {
          embedInputTokens = embedMeta.promptTokenCount as number;
        } else {
          embedInputTokens = Math.max(1, Math.ceil(finalDescription.length / 4));
        }

        const embeddingResult = {
          text: "",
          provider: "gemini" as const,
          model: registry.embedding.model,
          inputTokens: embedInputTokens,
          outputTokens: 0,
        };

        await recordUsageBestEffort(bookId, "embedding", embeddingResult);

        // Upsert entity fact document
        await factRef.set({
          name: displayName,
          type: entity.type,
          description: finalDescription,
          embedding: embeddingValues,
          updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`Successfully processed and upserted fact: ${displayName}`);
      }
    } catch (error) {
      console.error("Failed silently during background entity extraction:", error);
    }
}

export const extractEntitiesOnSceneAccept = onDocumentCreated(
  {
    document: "books/{bookId}/chapters/{chapterId}/scenes/{sceneId}",
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  handleSceneAccept
);

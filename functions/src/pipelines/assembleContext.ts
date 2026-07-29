import { GoogleGenAI } from "@google/genai";

import {
  getActiveChapter,
  getActiveChapterScenes,
  getBook,
  getPreviousChapterLastScenes,
  getPriorChapterSummaries,
  retrieveRelevantFacts,
} from "../services/books.js";
import { readModelRegistry, type AIProviderKeys } from "../services/gemini.js";
import type { SceneInput } from "../types/sceneInput.js";

/**
 * The "retrieval" half of context assembly (AD-4): this is the part cached
 * in a generation session and reused on regenerate. It deliberately excludes
 * Book/Vision/Style/Threads — `composePrompt` reads those live on every
 * invocation (including regenerate) so a mid-attempt style or thread edit is
 * always honored, per AD-4's "always reads the live Style, Vision doc, and
 * threads" rule.
 */
export type AssembledContext = {
  chapterId: string | undefined;
  priorScenesText: string[];
  lastScenesText?: string[];            // Last 1-2 scenes of the previous chapter
  priorChapterSummaries?: string[];     // One stored summary per prior chapter
  relevantFactsText?: string[];         // Facts retrieved by findNearest
  manuscriptRevision?: number;
};

function getEmbeddingQueryText(input: SceneInput): string {
  if (input.mode === "free-text") {
    return input.description.trim();
  }
  if (input.mode === "polish") {
    return input.draftText.trim();
  }
  const fields = input.fields;
  const parts: string[] = [];
  if (fields.sceneGoal?.trim()) parts.push(`Scene goal: ${fields.sceneGoal.trim()}`);
  if (fields.mood?.trim()) parts.push(`Mood: ${fields.mood.trim()}`);
  if (fields.povCharacter?.trim()) parts.push(`POV/character: ${fields.povCharacter.trim()}`);
  if (fields.setting?.trim()) parts.push(`Setting: ${fields.setting.trim()}`);
  return parts.join(". ");
}

export async function assembleContext(
  bookId: string,
  input?: SceneInput,
  apiKeys?: AIProviderKeys,
): Promise<AssembledContext> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await getBook(bookId);
    const { chapterId, scenes } = await getActiveChapterScenes(bookId);
    const after = await getBook(bookId);
    const beforeRevision =
      typeof before?.manuscriptRevision === "number" ? before.manuscriptRevision : 0;
    const afterRevision =
      typeof after?.manuscriptRevision === "number" ? after.manuscriptRevision : 0;

    if (beforeRevision === afterRevision) {
      // 1. Fetch previous chapter scenes and prior chapter summaries (if not first chapter)
      let lastScenesText: string[] = [];
      let priorChapterSummaries: string[] = [];

      try {
        const activeChapter = await getActiveChapter(bookId);
        if (activeChapter) {
          const activeChapterOrder = activeChapter.order;
          if (activeChapterOrder > 0) {
            const prevScenes = await getPreviousChapterLastScenes(bookId, activeChapterOrder);
            lastScenesText = prevScenes.map((s) => s.text);
            priorChapterSummaries = await getPriorChapterSummaries(bookId, activeChapterOrder);
          }
        }
      } catch (err) {
        console.error("Context assembly - chapter history retrieval failed, degrading gracefully:", err);
      }

      // 2. Fetch nearest facts based on input prompt embedding similarity
      let relevantFactsText: string[] = [];
      if (input && apiKeys?.gemini) {
        try {
          const queryText = getEmbeddingQueryText(input);
          if (queryText.length > 0) {
            const registry = await readModelRegistry();
            const ai = new GoogleGenAI({ apiKey: apiKeys.gemini });
            const embedResponse = await ai.models.embedContent({
              model: registry.embedding.model,
              contents: queryText,
              config: {
                outputDimensionality: registry.embedding.outputDimensionality,
              },
            });
            const embeddingValues = embedResponse.embeddings?.[0]?.values;
            if (embeddingValues && Array.isArray(embeddingValues)) {
              relevantFactsText = await retrieveRelevantFacts(bookId, embeddingValues);
            }
          }
        } catch (err) {
          console.error("Context assembly - fact retrieval failed, degrading gracefully:", err);
        }
      }

      return {
        chapterId,
        priorScenesText: scenes.map((scene) => scene.text),
        lastScenesText,
        priorChapterSummaries,
        relevantFactsText,
        manuscriptRevision: afterRevision,
      };
    }
  }

  throw new Error("Manuscript changed repeatedly during context assembly.");
}

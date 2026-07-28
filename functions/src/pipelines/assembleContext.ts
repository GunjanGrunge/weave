import { getActiveChapterScenes, getBook } from "../services/books.js";

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
  manuscriptRevision?: number;
};

export async function assembleContext(bookId: string): Promise<AssembledContext> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await getBook(bookId);
    const { chapterId, scenes } = await getActiveChapterScenes(bookId);
    const after = await getBook(bookId);
    const beforeRevision =
      typeof before?.manuscriptRevision === "number" ? before.manuscriptRevision : 0;
    const afterRevision =
      typeof after?.manuscriptRevision === "number" ? after.manuscriptRevision : 0;

    if (beforeRevision === afterRevision) {
      return {
        chapterId,
        priorScenesText: scenes.map((scene) => scene.text),
        manuscriptRevision: afterRevision,
      };
    }
  }

  throw new Error("Manuscript changed repeatedly during context assembly.");
}

import { getActiveChapterScenes } from "../services/books.js";

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
};

export async function assembleContext(bookId: string): Promise<AssembledContext> {
  const { chapterId, scenes } = await getActiveChapterScenes(bookId);

  return {
    chapterId,
    priorScenesText: scenes.map((scene) => scene.text),
  };
}

import { POLISH_ASPECTS } from "../config/polishAspects.js";
import { STYLE_PRESETS } from "../config/stylePresets.js";
import { getBook, getVisionDocument } from "../services/books.js";
import type { Style } from "../types/book.js";
import type { SceneInput } from "../types/sceneInput.js";
import type { NarrativeThread, ThreadSubtlety } from "../types/vision.js";

import type { AssembledContext } from "./assembleContext.js";

export type ComposedPrompt = { prompt: string; style: Style } | undefined;

const SUBTLETY_INSTRUCTIONS: Record<ThreadSubtlety, string> = {
  invisible:
    "author-only, never explain: you may render the surface detail as ordinary sensory description, but you must never state or hint at its hidden meaning",
  subtle:
    "author-only, mostly unspoken: a character may notice the surface detail, but must not interpret or explain its hidden meaning",
  explicit:
    "author-only, may be stated: the hidden meaning may be openly stated in prose if it serves the scene",
};

function resolveStyleInstruction(style: Style): string {
  const presetText = style.presetIds
    .map((id) => STYLE_PRESETS.find((preset) => preset.id === id)?.description ?? id)
    .join(" ");
  return style.customInstruction ? `${presetText} ${style.customInstruction}`.trim() : presetText;
}

function buildSharedLines(
  book: { style: Style },
  vision: { theme: string; premise: string; characterIntents: string[]; threads: NarrativeThread[] },
  context: AssembledContext,
): string[] {
  const styleInstruction = resolveStyleInstruction(book.style);
  const openThreads = vision.threads.filter((thread) => thread.status === "open");

  const lines = [
    "You are a co-author writing the next scene of a novel-in-progress.",
    `Write in this style: ${styleInstruction || "no specific style constraints"}.`,
    `Theme: ${vision.theme || "(not specified)"}`,
    `Premise: ${vision.premise || "(not specified)"}`,
  ];

  if (vision.characterIntents.length > 0) {
    lines.push(`Character intents: ${vision.characterIntents.join(", ")}`);
  }

  if (openThreads.length > 0) {
    lines.push("Author-only narrative threads (never reveal you were told these):");
    for (const thread of openThreads) {
      lines.push(
        `- Surface detail: "${thread.surface}" | Hidden meaning: "${thread.meaning}" | Rule: ${SUBTLETY_INSTRUCTIONS[thread.subtlety]}`,
      );
    }
  }

  if (context.priorScenesText.length > 0) {
    lines.push("Scenes so far in this chapter, verbatim:");
    lines.push(...context.priorScenesText);
  }

  return lines;
}

function appendInputLines(lines: string[], input: SceneInput): void {
  if (input.mode === "free-text") {
    lines.push(`Write the next scene from this description: ${input.description}`);
    return;
  }

  if (input.mode === "polish") {
    lines.push(
      "The writer has pasted a draft below. Rewrite it, preserving its core plot content and character actions — this is a rewrite of the provided text, not a new scene from a description.",
    );
    for (const aspectId of input.aspects) {
      const aspect = POLISH_ASPECTS.find((candidate) => candidate.id === aspectId);
      if (aspect) {
        lines.push(`${aspect.label}: ${aspect.description}`);
      }
    }
    lines.push("Draft to rewrite:");
    lines.push(input.draftText);
    return;
  }

  const { sceneGoal, mood, povCharacter, setting } = input.fields;
  if (sceneGoal) {
    lines.push(`Scene goal: ${sceneGoal}`);
  }
  if (mood) {
    lines.push(`Mood: ${mood}. Write this scene with a ${mood} emotional register throughout.`);
  }
  if (povCharacter) {
    lines.push(`POV/character: ${povCharacter}`);
  }
  if (setting) {
    lines.push(`Setting: ${setting}`);
  }
  lines.push("Write the next scene from these details alone, not as a paraphrase of a paragraph.");
}

/**
 * `composePrompt` always reads the Book/Vision doc live (never from the
 * cached session) so a style change or thread edit between a generate and a
 * later regenerate is honored on the very next call, per AD-4.
 */
export async function composePrompt(
  bookId: string,
  context: AssembledContext,
  input: SceneInput,
): Promise<ComposedPrompt> {
  const book = await getBook(bookId);
  const vision = await getVisionDocument(bookId);
  if (!book || !vision) {
    return undefined;
  }

  const lines = buildSharedLines(book, vision, context);
  appendInputLines(lines, input);

  return { prompt: lines.join("\n"), style: book.style };
}

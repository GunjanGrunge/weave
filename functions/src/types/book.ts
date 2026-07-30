import type { StoryBibleMemoryState } from "./storyBible.js";

export type Style = {
  presetIds: string[];
  customInstruction?: string;
};

export type Book = {
  uid: string;
  title: string;
  style: Style;
  styleRevision?: number;
  manuscriptRevision?: number;
  storyBibleState?: StoryBibleMemoryState;
  storyBibleSourceRevision?: number;
  storyBibleRevision?: number;
  storyBibleRebuildRequestId?: string;
  storyBiblePendingSources?: string[];
  storyBibleFailedSources?: string[];
  createdAt: unknown;
};

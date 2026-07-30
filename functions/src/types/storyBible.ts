export type StoryBibleVerification = "verified" | "unverified" | "stale";
export type StoryBibleMemoryState = "empty" | "current" | "stale" | "rebuild-required";
export type TemporalContext = "present" | "historical" | "ambiguous";

export type CharacterSourceRef = {
  chapterId: string;
  sceneId: string;
  excerpt: string;
};

export type ExtractedCharacterValue = {
  field: string;
  value: string;
  excerpt: string;
};

export type ExtractedTimelineEvent = {
  label: string;
  description: string;
  chronology: TemporalContext;
  excerpt: string;
};

export type ExtractedCharacterEvidence = {
  characterKey: string;
  name: string;
  summary?: string;
  aliases: string[];
  stableTraits: ExtractedCharacterValue[];
  currentState: ExtractedCharacterValue[];
  timelineEvents: ExtractedTimelineEvent[];
  temporalContext: TemporalContext;
};

export type StoryBibleMemorySource = {
  id: string;
  chapterId: string;
  sceneId: string;
  chapterOrder: number;
  sceneOrder: number;
  textHash: string;
  rebuildRequestId?: string;
  characters: ExtractedCharacterEvidence[];
  extractedAt: unknown;
};

export type CharacterTimelineEvent = {
  id: string;
  label: string;
  description: string;
  chronology: TemporalContext;
  source: CharacterSourceRef;
};

export type CharacterConflict = {
  field: string;
  canonicalValue: string;
  evidenceValue: string;
  source: CharacterSourceRef;
};

export type CharacterOverrides = {
  name?: string;
  aliases?: string[];
  summary?: string;
  stableTraits: Record<string, string>;
  currentState: Record<string, string>;
};

export type CharacterProfile = {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  stableTraits: Record<string, string>;
  currentState: Record<string, string>;
  timeline: CharacterTimelineEvent[];
  sources: CharacterSourceRef[];
  conflicts: CharacterConflict[];
  authorOverrides: CharacterOverrides;
  lockedFields: string[];
  verification: StoryBibleVerification;
  migrationState: "native" | "legacy-fact";
  archived: boolean;
  version: number;
  updatedAt: unknown;
};

export type StoryBibleCharacterPatch = {
  name: string;
  aliases: string[];
  summary: string;
  stableTraits: Record<string, string>;
  currentState: Record<string, string>;
  lockedFields: string[];
  archived: boolean;
};

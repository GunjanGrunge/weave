import type { SceneInput } from "./sceneInput.js";
import type { StoryBibleMemoryState } from "./storyBible.js";

export type SceneAttempt = {
  text: string;
  provider: "openai" | "gemini";
  model: string;
};

export type CandidateResult = {
  sessionId: string;
  messageId: string;
  text: string;
  revision: number;
  candidateStatus: "active" | "accepted";
  provider: "openai" | "gemini";
  model: string;
  previousAttempt?: SceneAttempt;
  acceptedSceneId?: string;
  acceptedSceneOrder?: number;
};

export type GenerationOperation = {
  idempotencyKey: string;
  attemptToken: string;
  leaseExpiresAt: number;
  expectedRevision: number;
  manuscriptRevision: number;
  status: "in-progress" | "completed" | "failed";
  result?: CandidateResult;
};

export type GenerationSession = {
  bookId: string;
  chapterId: string | null;
  input: SceneInput;
  assembledContext: {
    priorScenesText: string[];
    canonicalRosterText?: string;
    storyBibleState?: StoryBibleMemoryState;
    storyBibleRevision?: number;
  };
  manuscriptRevision: number;
  storyBibleRevision?: number;
  candidate: SceneAttempt;
  revision: number;
  previousAttempt?: SceneAttempt;
  messageId: string;
  status: "active" | "accepted";
  acceptedSceneId?: string;
  acceptedSceneOrder?: number;
  regenerateOperation?: GenerationOperation;
  createdAt: unknown;
  updatedAt: unknown;
};

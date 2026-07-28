import type { SceneInput } from "./sceneInput.js";

export type SceneAttempt = {
  text: string;
  provider: "openai" | "gemini";
  model: string;
};

export type GenerationOperation = {
  idempotencyKey: string;
  attemptToken: string;
  leaseExpiresAt: number;
  expectedRevision: number;
  manuscriptRevision: number;
  status: "in-progress" | "completed";
};

export type GenerationSession = {
  bookId: string;
  chapterId: string | null;
  input: SceneInput;
  assembledContext: {
    priorScenesText: string[];
  };
  manuscriptRevision: number;
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

import type { PolishAspectId } from "../config/polishAspects.js";

export type StructuredSceneFields = {
  sceneGoal?: string;
  mood?: string;
  povCharacter?: string;
  setting?: string;
};

export type SceneLength = "concise" | "standard" | "immersive";
export type GenerationQuality = "standard" | "deep";
export type ScenePreferences = {
  length?: SceneLength;
  quality?: GenerationQuality;
  customDirection?: string;
};

export type SceneInput =
  | { mode: "free-text"; description: string; preferences?: ScenePreferences }
  | { mode: "structured"; fields: StructuredSceneFields; preferences?: ScenePreferences }
  | {
      mode: "polish";
      draftText: string;
      aspects: PolishAspectId[];
      preferences?: ScenePreferences;
    };

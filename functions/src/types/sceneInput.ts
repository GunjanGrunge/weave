export type StructuredSceneFields = {
  sceneGoal?: string;
  mood?: string;
  povCharacter?: string;
  setting?: string;
};

export type SceneInput =
  | { mode: "free-text"; description: string }
  | { mode: "structured"; fields: StructuredSceneFields };

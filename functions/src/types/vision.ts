export type ThreadSubtlety = "invisible" | "subtle" | "explicit";
export type ThreadStatus = "open" | "paid_off";

export type NarrativeThread = {
  id: string;
  surface: string;
  meaning: string;
  subtlety: ThreadSubtlety;
  payoffIntent: string;
  status: ThreadStatus;
  appearances: string[];
};

export type StructureBeat = {
  beat: string;
  sceneRef: string;
};

export type VisionDocument = {
  theme: string;
  premise: string;
  characterIntents: string[];
  structureMap: StructureBeat[];
  guidanceDial: "normal";
  threads: NarrativeThread[];
};

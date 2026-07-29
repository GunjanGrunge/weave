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

export type Audience = "general" | "children" | "middle-grade" | "young-adult" | "adult";
export type GenreIntensity = "light" | "balanced" | "strong";

export type GenreProfile = {
  primaryGenre: string;
  secondaryGenres: string[];
  subgenre: string;
  audience: Audience;
  intensity: GenreIntensity;
  tones: string[];
  customDirection: string;
};

export type PointOfView =
  | "unspecified"
  | "first-person"
  | "third-person-limited"
  | "third-person-omniscient"
  | "second-person";
export type NarrativeTense = "unspecified" | "past" | "present";
export type VoiceLevel = "restrained" | "balanced" | "rich";
export type NarrativeDistance = "close" | "balanced" | "distant";
export type ProsePacing = "measured" | "balanced" | "brisk";

export type VoiceProfile = {
  pointOfView: PointOfView;
  tense: NarrativeTense;
  narrativeDistance: NarrativeDistance;
  proseDensity: VoiceLevel;
  descriptionLevel: VoiceLevel;
  interiorityLevel: VoiceLevel;
  dialogueLevel: VoiceLevel;
  pacing: ProsePacing;
  emotionalIntensity: VoiceLevel;
  customDirection: string;
};

export type VisionDocument = {
  theme: string;
  premise: string;
  characterIntents: string[];
  structureMap: StructureBeat[];
  guidanceDial: "normal";
  threads: NarrativeThread[];
  // Optional on stored legacy documents. API and prompt boundaries normalize
  // both profiles before use.
  genreProfile?: GenreProfile;
  voiceProfile?: VoiceProfile;
};

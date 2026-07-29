export type Audience = "general" | "children" | "middle-grade" | "young-adult" | "adult";
export type GenreIntensity = "light" | "balanced" | "strong";
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

export type GenreProfile = {
  primaryGenre: string;
  secondaryGenres: string[];
  subgenre: string;
  audience: Audience;
  intensity: GenreIntensity;
  tones: string[];
  customDirection: string;
};

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

export type GenreOption = { id: string; label: string; description: string };
export type WritingProfileConfig = {
  genres: GenreOption[];
  defaults: { genreProfile: GenreProfile; voiceProfile: VoiceProfile };
};

export const DEFAULT_GENRE_PROFILE: GenreProfile = {
  primaryGenre: "general-fiction",
  secondaryGenres: [],
  subgenre: "",
  audience: "adult",
  intensity: "balanced",
  tones: [],
  customDirection: "",
};

export const DEFAULT_VOICE_PROFILE: VoiceProfile = {
  pointOfView: "unspecified",
  tense: "unspecified",
  narrativeDistance: "balanced",
  proseDensity: "balanced",
  descriptionLevel: "rich",
  interiorityLevel: "balanced",
  dialogueLevel: "balanced",
  pacing: "balanced",
  emotionalIntensity: "rich",
  customDirection: "",
};

export const FALLBACK_GENRES: GenreOption[] = [
  ["general-fiction", "General Fiction"],
  ["fantasy", "Fantasy"],
  ["romance", "Romance"],
  ["mystery", "Mystery"],
  ["thriller", "Thriller"],
  ["horror", "Horror"],
  ["historical-fiction", "Historical Fiction"],
  ["literary-fiction", "Literary Fiction"],
  ["science-fiction", "Science Fiction"],
  ["adventure", "Adventure"],
  ["comedy", "Comedy"],
  ["drama", "Drama"],
  ["young-adult", "Young Adult"],
  ["childrens-fiction", "Children's Fiction"],
  ["poetry", "Poetry"],
  ["playwriting", "Playwriting"],
].map(([id, label]) => ({ id, label, description: "" }));

export const DEFAULT_WRITING_CONFIG: WritingProfileConfig = {
  genres: FALLBACK_GENRES,
  defaults: {
    genreProfile: DEFAULT_GENRE_PROFILE,
    voiceProfile: DEFAULT_VOICE_PROFILE,
  },
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

export function parseGenreProfile(value: unknown): GenreProfile | undefined {
  const item = record(value);
  const secondaryGenres = stringArray(item?.secondaryGenres);
  const tones = stringArray(item?.tones);
  if (
    !item ||
    typeof item.primaryGenre !== "string" ||
    !secondaryGenres ||
    secondaryGenres.length > 2 ||
    typeof item.subgenre !== "string" ||
    !["general", "children", "middle-grade", "young-adult", "adult"].includes(
      item.audience as string,
    ) ||
    !["light", "balanced", "strong"].includes(item.intensity as string) ||
    !tones ||
    typeof item.customDirection !== "string"
  ) {
    return undefined;
  }
  return item as GenreProfile;
}

export function parseVoiceProfile(value: unknown): VoiceProfile | undefined {
  const item = record(value);
  if (
    !item ||
    ![
      "unspecified",
      "first-person",
      "third-person-limited",
      "third-person-omniscient",
      "second-person",
    ].includes(item.pointOfView as string) ||
    !["unspecified", "past", "present"].includes(item.tense as string) ||
    !["close", "balanced", "distant"].includes(item.narrativeDistance as string) ||
    !["restrained", "balanced", "rich"].includes(item.proseDensity as string) ||
    !["restrained", "balanced", "rich"].includes(item.descriptionLevel as string) ||
    !["restrained", "balanced", "rich"].includes(item.interiorityLevel as string) ||
    !["restrained", "balanced", "rich"].includes(item.dialogueLevel as string) ||
    !["measured", "balanced", "brisk"].includes(item.pacing as string) ||
    !["restrained", "balanced", "rich"].includes(item.emotionalIntensity as string) ||
    typeof item.customDirection !== "string"
  ) {
    return undefined;
  }
  return item as VoiceProfile;
}

export function parseWritingProfileConfig(value: unknown): WritingProfileConfig | undefined {
  const item = record(value);
  if (!item || !Array.isArray(item.genres)) return undefined;
  const ids = new Set<string>();
  const genres: GenreOption[] = [];
  for (const candidate of item.genres) {
    const genre = record(candidate);
    if (
      !genre ||
      typeof genre.id !== "string" ||
      !genre.id ||
      ids.has(genre.id) ||
      typeof genre.label !== "string" ||
      !genre.label ||
      typeof genre.description !== "string"
    ) {
      return undefined;
    }
    ids.add(genre.id);
    genres.push({
      id: genre.id,
      label: genre.label,
      description: genre.description,
    });
  }
  const defaults = record(item.defaults);
  const genreProfile = parseGenreProfile(defaults?.genreProfile);
  const voiceProfile = parseVoiceProfile(defaults?.voiceProfile);
  return genreProfile && voiceProfile
    ? { genres, defaults: { genreProfile, voiceProfile } }
    : undefined;
}

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  Audience,
  GenreIntensity,
  GenreProfile,
  NarrativeDistance,
  NarrativeTense,
  PointOfView,
  ProsePacing,
  VisionDocument,
  VoiceLevel,
  VoiceProfile,
} from "../types/vision.js";

type GenrePack = {
  id: string;
  label: string;
  description: string;
  principles: string[];
  techniques: string[];
  avoid: string[];
  qualityChecks: string[];
};

export type WritingProfileConfig = {
  genres: Array<Pick<GenrePack, "id" | "label" | "description">>;
  defaults: {
    genreProfile: GenreProfile;
    voiceProfile: VoiceProfile;
  };
};

export class WritingProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WritingProfileValidationError";
  }
}

const GENRE_IDS = [
  "general-fiction",
  "fantasy",
  "romance",
  "mystery",
  "thriller",
  "horror",
  "historical-fiction",
  "literary-fiction",
  "science-fiction",
  "adventure",
  "comedy",
  "drama",
  "young-adult",
  "childrens-fiction",
  "poetry",
  "playwriting",
] as const;

const AUDIENCES = new Set<Audience>([
  "general",
  "children",
  "middle-grade",
  "young-adult",
  "adult",
]);
const INTENSITIES = new Set<GenreIntensity>(["light", "balanced", "strong"]);
const POINTS_OF_VIEW = new Set<PointOfView>([
  "unspecified",
  "first-person",
  "third-person-limited",
  "third-person-omniscient",
  "second-person",
]);
const TENSES = new Set<NarrativeTense>(["unspecified", "past", "present"]);
const VOICE_LEVELS = new Set<VoiceLevel>(["restrained", "balanced", "rich"]);
const DISTANCES = new Set<NarrativeDistance>(["close", "balanced", "distant"]);
const PACING = new Set<ProsePacing>(["measured", "balanced", "brisk"]);
const GENRE_ID_SET = new Set<string>(GENRE_IDS);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item, index, items) => Boolean(item) && items.indexOf(item) === index)
    .slice(0, maxItems);
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function loadPack(id: string): GenrePack {
  const path = fileURLToPath(new URL(`../../config/genre-packs/${id}.json`, import.meta.url));
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(value) || value.id !== id) {
    throw new Error(`Genre craft pack is invalid: ${id}`);
  }
  const pack: GenrePack = {
    id,
    label: text(value.label, 80),
    description: text(value.description, 240),
    principles: stringList(value.principles, 8, 300),
    techniques: stringList(value.techniques, 8, 300),
    avoid: stringList(value.avoid, 8, 300),
    qualityChecks: stringList(value.qualityChecks, 8, 300),
  };
  if (
    !pack.label ||
    !pack.description ||
    pack.principles.length === 0 ||
    pack.qualityChecks.length === 0
  ) {
    throw new Error(`Genre craft pack is incomplete: ${id}`);
  }
  return pack;
}

const PACKS = new Map<string, GenrePack>(GENRE_IDS.map((id) => [id, loadPack(id)]));

export function getWritingProfileConfig(): WritingProfileConfig {
  return {
    genres: GENRE_IDS.map((id) => {
      const pack = PACKS.get(id)!;
      return { id: pack.id, label: pack.label, description: pack.description };
    }),
    defaults: {
      genreProfile: { ...DEFAULT_GENRE_PROFILE },
      voiceProfile: { ...DEFAULT_VOICE_PROFILE },
    },
  };
}

export function normalizeGenreProfile(value: unknown): GenreProfile {
  const record = isRecord(value) ? value : {};
  const primaryGenre =
    typeof record.primaryGenre === "string" && GENRE_ID_SET.has(record.primaryGenre)
      ? record.primaryGenre
      : DEFAULT_GENRE_PROFILE.primaryGenre;
  const secondaryGenres = stringList(record.secondaryGenres, 2, 80).filter(
    (id) => GENRE_ID_SET.has(id) && id !== primaryGenre,
  );
  return {
    primaryGenre,
    secondaryGenres,
    subgenre: text(record.subgenre, 120),
    audience: enumValue(record.audience, AUDIENCES, DEFAULT_GENRE_PROFILE.audience),
    intensity: enumValue(record.intensity, INTENSITIES, DEFAULT_GENRE_PROFILE.intensity),
    tones: stringList(record.tones, 5, 60),
    customDirection: text(record.customDirection, 1_000),
  };
}

export function normalizeVoiceProfile(value: unknown): VoiceProfile {
  const record = isRecord(value) ? value : {};
  return {
    pointOfView: enumValue(record.pointOfView, POINTS_OF_VIEW, DEFAULT_VOICE_PROFILE.pointOfView),
    tense: enumValue(record.tense, TENSES, DEFAULT_VOICE_PROFILE.tense),
    narrativeDistance: enumValue(
      record.narrativeDistance,
      DISTANCES,
      DEFAULT_VOICE_PROFILE.narrativeDistance,
    ),
    proseDensity: enumValue(record.proseDensity, VOICE_LEVELS, DEFAULT_VOICE_PROFILE.proseDensity),
    descriptionLevel: enumValue(
      record.descriptionLevel,
      VOICE_LEVELS,
      DEFAULT_VOICE_PROFILE.descriptionLevel,
    ),
    interiorityLevel: enumValue(
      record.interiorityLevel,
      VOICE_LEVELS,
      DEFAULT_VOICE_PROFILE.interiorityLevel,
    ),
    dialogueLevel: enumValue(
      record.dialogueLevel,
      VOICE_LEVELS,
      DEFAULT_VOICE_PROFILE.dialogueLevel,
    ),
    pacing: enumValue(record.pacing, PACING, DEFAULT_VOICE_PROFILE.pacing),
    emotionalIntensity: enumValue(
      record.emotionalIntensity,
      VOICE_LEVELS,
      DEFAULT_VOICE_PROFILE.emotionalIntensity,
    ),
    customDirection: text(record.customDirection, 1_000),
  };
}

export function parseGenreProfile(value: unknown): GenreProfile {
  if (!isRecord(value)) {
    throw new WritingProfileValidationError("genreProfile must be an object.");
  }
  const normalized = normalizeGenreProfile(value);
  if (value.primaryGenre !== normalized.primaryGenre) {
    throw new WritingProfileValidationError("Primary genre is invalid.");
  }
  if (
    !Array.isArray(value.secondaryGenres) ||
    value.secondaryGenres.length > 2 ||
    value.secondaryGenres.some(
      (id) => typeof id !== "string" || !GENRE_ID_SET.has(id) || id === normalized.primaryGenre,
    ) ||
    new Set(value.secondaryGenres).size !== value.secondaryGenres.length
  ) {
    throw new WritingProfileValidationError("Choose up to two distinct secondary genres.");
  }
  if (!AUDIENCES.has(value.audience as Audience)) {
    throw new WritingProfileValidationError("Audience is invalid.");
  }
  if (!INTENSITIES.has(value.intensity as GenreIntensity)) {
    throw new WritingProfileValidationError("Genre intensity is invalid.");
  }
  if (
    typeof value.subgenre !== "string" ||
    typeof value.customDirection !== "string" ||
    !Array.isArray(value.tones) ||
    value.tones.some((tone) => typeof tone !== "string")
  ) {
    throw new WritingProfileValidationError("Genre profile text fields are invalid.");
  }
  return normalized;
}

export function parseVoiceProfile(value: unknown): VoiceProfile {
  if (!isRecord(value)) {
    throw new WritingProfileValidationError("voiceProfile must be an object.");
  }
  const normalized = normalizeVoiceProfile(value);
  const checks: Array<[unknown, Set<string>, string]> = [
    [value.pointOfView, POINTS_OF_VIEW, "Point of view"],
    [value.tense, TENSES, "Tense"],
    [value.narrativeDistance, DISTANCES, "Narrative distance"],
    [value.proseDensity, VOICE_LEVELS, "Prose density"],
    [value.descriptionLevel, VOICE_LEVELS, "Description level"],
    [value.interiorityLevel, VOICE_LEVELS, "Interiority level"],
    [value.dialogueLevel, VOICE_LEVELS, "Dialogue level"],
    [value.pacing, PACING, "Pacing"],
    [value.emotionalIntensity, VOICE_LEVELS, "Emotional intensity"],
  ];
  for (const [candidate, allowed, label] of checks) {
    if (typeof candidate !== "string" || !allowed.has(candidate)) {
      throw new WritingProfileValidationError(`${label} is invalid.`);
    }
  }
  if (typeof value.customDirection !== "string") {
    throw new WritingProfileValidationError("Voice custom direction must be a string.");
  }
  return normalized;
}

export function normalizeVisionWritingProfiles(vision: VisionDocument): VisionDocument {
  return {
    ...vision,
    genreProfile: normalizeGenreProfile(vision.genreProfile),
    voiceProfile: normalizeVoiceProfile(vision.voiceProfile),
  };
}

function bulletLines(label: string, values: string[]): string[] {
  return values.length > 0 ? [label, ...values.map((value) => `- ${value}`)] : [];
}

export function composeWritingProfileInstruction(vision: VisionDocument): string {
  const genre = normalizeGenreProfile(vision.genreProfile);
  const voice = normalizeVoiceProfile(vision.voiceProfile);
  const selectedIds = [genre.primaryGenre, ...genre.secondaryGenres];
  const weights =
    selectedIds.length === 1
      ? ["100%"]
      : selectedIds.length === 2
        ? ["70%", "30%"]
        : ["60%", "25%", "15%"];
  const lines = [
    "BOOK GENRE CONTRACT",
    ...selectedIds.map((id, index) => {
      const pack = PACKS.get(id)!;
      return `${index === 0 ? "Primary" : `Secondary ${index}`} genre (${weights[index]}): ${pack.label}`;
    }),
    `Audience: ${genre.audience}`,
    `Genre intensity: ${genre.intensity}`,
  ];
  if (genre.subgenre) lines.push(`Subgenre: ${genre.subgenre}`);
  if (genre.tones.length > 0) lines.push(`Tonal direction: ${genre.tones.join(", ")}`);
  if (genre.customDirection) lines.push(`Author's genre direction: ${genre.customDirection}`);

  selectedIds.forEach((id, index) => {
    const pack = PACKS.get(id)!;
    lines.push(
      "",
      `${pack.label} craft obligations (${index === 0 ? "governing" : "supporting"}):`,
      ...pack.principles.map((item) => `- ${item}`),
      ...bulletLines("Useful scene techniques:", pack.techniques),
      ...bulletLines("Avoid:", pack.avoid),
      ...bulletLines("Silent quality checks:", pack.qualityChecks),
    );
  });

  lines.push(
    "",
    "Blend all active genres through the same events, character choices, and consequences. Do not write separate genre-flavored passages. The primary genre governs conflicts. Explicit author instructions and established continuity override genre convention.",
    "",
    "BOOK VOICE PROFILE",
    `Point of view: ${voice.pointOfView}`,
    `Tense: ${voice.tense}`,
    `Narrative distance: ${voice.narrativeDistance}`,
    `Prose density: ${voice.proseDensity}`,
    `Description: ${voice.descriptionLevel}`,
    `Interiority: ${voice.interiorityLevel}`,
    `Dialogue: ${voice.dialogueLevel}`,
    `Pacing: ${voice.pacing}`,
    `Emotional intensity: ${voice.emotionalIntensity}`,
  );
  if (voice.customDirection) lines.push(`Author's voice direction: ${voice.customDirection}`);
  return lines.join("\n");
}

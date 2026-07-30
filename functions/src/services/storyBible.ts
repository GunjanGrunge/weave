import { createHash, randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type {
  CharacterConflict,
  CharacterOverrides,
  CharacterProfile,
  CharacterSourceRef,
  CharacterTimelineEvent,
  ExtractedCharacterEvidence,
  StoryBibleCharacterPatch,
  StoryBibleMemorySource,
  StoryBibleMemoryState,
} from "../types/storyBible.js";

const MAX_CHARACTER_PROFILES = 350;
const MAX_REBUILD_SCENES = 5_000;
const MAX_PROFILE_TIMELINE = 100;
const MAX_PROFILE_SOURCES = 100;
const MAX_PROFILE_CONFLICTS = 100;
const MAX_ROSTER_CHARACTERS = 120;
const MAX_ROSTER_CHARS = 32_000;
const MAX_ROSTER_FIELD_CHARS = 300;

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

export class StoryBibleError extends Error {
  constructor(
    public readonly code: "not-found" | "version-conflict" | "invalid-state",
    message: string,
  ) {
    super(message);
    this.name = "StoryBibleError";
  }
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedField(value: string): string {
  return normalizedKey(value).replace(/[^a-z0-9 _-]/g, "").slice(0, 80);
}

function normalizedLockPath(value: string): string {
  if (value === "name" || value === "summary") return value;
  const separator = value.indexOf(".");
  if (separator < 1) return "";
  const section = value.slice(0, separator);
  if (section !== "stableTraits" && section !== "currentState") return "";
  const field = normalizedField(value.slice(separator + 1));
  return field ? `${section}.${field}` : "";
}

export function resolveCharacterEvidenceKeys(
  characters: ExtractedCharacterEvidence[],
  profiles: CharacterProfile[],
): ExtractedCharacterEvidence[] {
  const profileIdsByName = new Map<string, Set<string>>();
  for (const profile of profiles) {
    for (const candidate of [profile.name, ...profile.aliases]) {
      const normalized = normalizedKey(candidate);
      if (!normalized) continue;
      const ids = profileIdsByName.get(normalized) ?? new Set<string>();
      ids.add(profile.id);
      profileIdsByName.set(normalized, ids);
    }
  }

  return characters.map((character) => {
    const matchingIds = new Set<string>();
    for (const candidate of [character.name, ...character.aliases]) {
      const ids = profileIdsByName.get(normalizedKey(candidate));
      if (ids?.size === 1) matchingIds.add([...ids][0]);
    }
    return matchingIds.size === 1 ? { ...character, characterKey: [...matchingIds][0] } : character;
  });
}

export function characterIdForName(name: string): string {
  const normalized = normalizedKey(name);
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 10);
  return `${slug || "character"}-${hash}`;
}

export function storyBibleExtractionTaskId(
  chapterId: string,
  sceneId: string,
  text: string,
  versionKey = "",
): string {
  const textHash = createHash("sha256")
    .update(`${text}\0${versionKey}`)
    .digest("hex")
    .slice(0, 16);
  return `entities-${chapterId}-${sceneId}-${textHash}`;
}

function sourceId(chapterId: string, sceneId: string): string {
  return createHash("sha256").update(`${chapterId}:${sceneId}`).digest("hex").slice(0, 24);
}

export function reconciledStoryBibleWork(input: {
  pendingSources: string[];
  failedSources: string[];
  priorState?: StoryBibleMemoryState;
  manifestId: string;
  sourcePresent: boolean;
  rebuildRequestId?: string;
  activeRebuildRequestId?: string;
}): {
  pendingSources: string[];
  failedSources: string[];
  state: StoryBibleMemoryState;
} {
  const pending = new Set(input.pendingSources);
  const failed = new Set(input.failedSources);
  const completesCurrentRebuild =
    (!input.sourcePresent && pending.has(input.manifestId)) ||
    (typeof input.rebuildRequestId === "string" &&
      input.rebuildRequestId === input.activeRebuildRequestId);
  if (completesCurrentRebuild) pending.delete(input.manifestId);
  failed.delete(input.manifestId);
  const state: StoryBibleMemoryState =
    pending.size > 0 ||
    (input.priorState === "rebuild-required" && !completesCurrentRebuild)
      ? "rebuild-required"
      : failed.size > 0
        ? "stale"
        : "current";
  return {
    pendingSources: [...pending],
    failedSources: [...failed],
    state,
  };
}

function cleanRecord(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([field, value]) => [normalizedField(field), value.trim()] as const)
      .filter(([field, value]) => field.length > 0 && value.length > 0),
  );
}

function sourceRef(
  source: StoryBibleMemorySource,
  evidence: ExtractedCharacterEvidence,
): CharacterSourceRef {
  const excerpt =
    evidence.stableTraits[0]?.excerpt ??
    evidence.currentState[0]?.excerpt ??
    evidence.timelineEvents[0]?.excerpt ??
    evidence.name;
  return {
    chapterId: source.chapterId,
    sceneId: source.sceneId,
    excerpt: excerpt.slice(0, 500),
  };
}

function emptyOverrides(): CharacterOverrides {
  return { stableTraits: {}, currentState: {} };
}

function eventId(
  source: StoryBibleMemorySource,
  event: ExtractedCharacterEvidence["timelineEvents"][number],
): string {
  return createHash("sha256")
    .update(`${source.chapterId}:${source.sceneId}:${event.label}:${event.description}`)
    .digest("hex")
    .slice(0, 20);
}

export function materializeCharacterProfile(
  characterKey: string,
  sources: StoryBibleMemorySource[],
  existing?: CharacterProfile,
): CharacterProfile {
  const ordered = [...sources].sort(
    (left, right) =>
      left.chapterOrder - right.chapterOrder ||
      left.sceneOrder - right.sceneOrder ||
      left.id.localeCompare(right.id),
  );
  const evidence = ordered.flatMap((source) =>
    source.characters
      .filter((character) => character.characterKey === characterKey)
      .map((character) => ({ source, character })),
  );
  const overrides: CharacterOverrides = existing?.authorOverrides
    ? {
        ...existing.authorOverrides,
        aliases: existing.authorOverrides.aliases
          ? [...existing.authorOverrides.aliases]
          : undefined,
        stableTraits: cleanRecord(existing.authorOverrides.stableTraits),
        currentState: cleanRecord(existing.authorOverrides.currentState),
      }
    : emptyOverrides();
  const locked = new Set(
    (existing?.lockedFields ?? []).map(normalizedLockPath).filter((field) => field.length > 0),
  );
  const stableTraits: Record<string, string> = {};
  const currentState: Record<string, string> = {};
  const aliases = new Set<string>();
  const timeline: CharacterTimelineEvent[] = [];
  const profileSources: CharacterSourceRef[] = [];
  const conflicts: CharacterConflict[] = [];
  let extractedName = existing?.name ?? characterKey;
  let extractedSummary = "";

  for (const { source, character } of evidence) {
    extractedName = character.name || extractedName;
    if (character.summary?.trim()) extractedSummary = character.summary.trim();
    character.aliases.filter(Boolean).forEach((alias) => aliases.add(alias.trim()));
    const ref = sourceRef(source, character);
    profileSources.push(ref);

    for (const trait of character.stableTraits) {
      const field = normalizedField(trait.field);
      const value = trait.value.trim();
      if (!field || !value || character.temporalContext !== "present") continue;
      const path = `stableTraits.${field}`;
      const canonicalOverride = overrides.stableTraits[field];
      const current = canonicalOverride ?? stableTraits[field];
      if (current && current !== value) {
        conflicts.push({
          field: path,
          canonicalValue: current,
          evidenceValue: value,
          source: { ...ref, excerpt: trait.excerpt || ref.excerpt },
        });
      }
      if (!stableTraits[field]) stableTraits[field] = value;
    }

    if (character.temporalContext === "present") {
      for (const state of character.currentState) {
        const field = normalizedField(state.field);
        const value = state.value.trim();
        if (!field || !value) continue;
        const canonicalOverride = overrides.currentState[field];
        if (canonicalOverride && canonicalOverride !== value) {
          conflicts.push({
            field: `currentState.${field}`,
            canonicalValue: canonicalOverride,
            evidenceValue: value,
            source: { ...ref, excerpt: state.excerpt || ref.excerpt },
          });
        }
        currentState[field] = value;
      }
    }

    for (const event of character.timelineEvents) {
      timeline.push({
        id: eventId(source, event),
        label: event.label,
        description: event.description,
        chronology: event.chronology,
        source: { ...ref, excerpt: event.excerpt || ref.excerpt },
      });
    }
  }

  Object.assign(stableTraits, cleanRecord(overrides.stableTraits));
  Object.assign(currentState, cleanRecord(overrides.currentState));
  (overrides.aliases ?? existing?.aliases ?? []).forEach((alias) => {
    if (alias.trim()) aliases.add(alias.trim());
  });

  return {
    id: existing?.id ?? characterKey,
    name: overrides.name?.trim() || extractedName,
    aliases: [...aliases]
      .filter((alias) => alias !== extractedName)
      .sort()
      .slice(0, 50)
      .map((alias) => alias.slice(0, 160)),
    summary: (overrides.summary ?? (extractedSummary || existing?.summary || "")).slice(0, 2_000),
    stableTraits: Object.fromEntries(
      Object.entries(stableTraits)
        .slice(0, 50)
        .map(([field, value]) => [field, value.slice(0, 500)]),
    ),
    currentState: Object.fromEntries(
      Object.entries(currentState)
        .slice(0, 50)
        .map(([field, value]) => [field, value.slice(0, 500)]),
    ),
    timeline: timeline.slice(-MAX_PROFILE_TIMELINE),
    sources: profileSources.slice(-MAX_PROFILE_SOURCES),
    conflicts: conflicts.slice(-MAX_PROFILE_CONFLICTS),
    authorOverrides: overrides,
    lockedFields: [...locked].sort(),
    verification:
      existing?.verification === "verified" && conflicts.length === 0
        ? "verified"
        : conflicts.length > 0
          ? "unverified"
          : (existing?.verification ?? "unverified"),
    migrationState: existing?.migrationState ?? "native",
    archived: existing?.archived ?? false,
    version: (existing?.version ?? 0) + 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export function legacyFactToCharacterProfile(
  _legacyFactId: string,
  fact: { name: string; description: string },
): CharacterProfile {
  return {
    id: characterIdForName(fact.name),
    name: fact.name.trim(),
    aliases: [],
    summary: fact.description.trim(),
    stableTraits: {},
    currentState: {},
    timeline: [],
    sources: [],
    conflicts: [],
    authorOverrides: emptyOverrides(),
    lockedFields: [],
    verification: "unverified",
    migrationState: "legacy-fact",
    archived: false,
    version: 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function compactRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([field, value]) => `${field}=${value.slice(0, MAX_ROSTER_FIELD_CHARS)}`)
    .join(", ");
}

export function buildCompactCharacterRoster(
  profiles: CharacterProfile[],
  memoryState: StoryBibleMemoryState,
): string {
  const active = profiles
    .filter((profile) => !profile.archived)
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_ROSTER_CHARACTERS);
  const lines = [`MEMORY STATUS: ${memoryState.toUpperCase()}`];
  for (const profile of active) {
    const parts = [`- ${profile.name}`];
    if (profile.aliases.length > 0) parts.push(`aliases: ${profile.aliases.join(", ")}`);
    if (profile.summary) parts.push(`summary: ${profile.summary.slice(0, MAX_ROSTER_FIELD_CHARS)}`);
    const stable = compactRecord(profile.stableTraits);
    const state = compactRecord(profile.currentState);
    if (stable) parts.push(`stable: ${stable}`);
    if (state) parts.push(`current: ${state}`);
    if (profile.timeline.length > 0) {
      parts.push(
        `history: ${profile.timeline
          .slice(-10)
          .map(
            (event) =>
              `${event.label.slice(0, 80)} (${event.chronology}): ${event.description.slice(0, MAX_ROSTER_FIELD_CHARS)}`,
          )
          .join("; ")}`,
      );
    }
    const line = parts.join(" | ");
    if (lines.join("\n").length + line.length + 1 > MAX_ROSTER_CHARS) break;
    lines.push(line);
  }
  return lines.join("\n");
}

async function readCharacterProfiles(bookId: string): Promise<CharacterProfile[]> {
  const snapshot = await firestore().collection("books").doc(bookId).collection("characters").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CharacterProfile);
}

async function migrateLegacyFacts(
  bookId: string,
  existing: CharacterProfile[],
): Promise<CharacterProfile[]> {
  const db = firestore();
  const facts = await db.collection("books").doc(bookId).collection("facts").get();
  const existingByIdentity = new Map<string, CharacterProfile>();
  for (const profile of existing) {
    for (const identity of [profile.name, ...profile.aliases]) {
      const key = normalizedKey(identity);
      if (key && !existingByIdentity.has(key)) existingByIdentity.set(key, profile);
    }
  }
  const characterFacts = facts.docs.filter((doc) => {
    const data = doc.data();
    return (
      data.type === "character" &&
      typeof data.name === "string" &&
      !existingByIdentity.has(normalizedKey(data.name))
    );
  });
  if (characterFacts.length === 0) return existing;

  const migrated = characterFacts.map((doc) => {
    const data = doc.data();
    const profile = legacyFactToCharacterProfile(doc.id, {
      name: typeof data.name === "string" ? data.name : "Unknown character",
      description: typeof data.description === "string" ? data.description : "",
    });
    return profile;
  });
  for (let offset = 0; offset < migrated.length; offset += 400) {
    const batch = db.batch();
    for (const profile of migrated.slice(offset, offset + 400)) {
      batch.set(db.collection("books").doc(bookId).collection("characters").doc(profile.id), profile);
    }
    if (offset + 400 >= migrated.length) {
      batch.update(db.collection("books").doc(bookId), {
        storyBibleState: "stale",
        storyBibleRevision: FieldValue.increment(1),
        storyBibleUpdatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return [...existing, ...migrated];
}

export async function listStoryBibleCharacters(bookId: string): Promise<CharacterProfile[]> {
  const existing = await readCharacterProfiles(bookId);
  const profiles = await migrateLegacyFacts(bookId, existing);
  return profiles.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getCanonicalRoster(bookId: string): Promise<{
  text: string;
  state: StoryBibleMemoryState;
  characterCount: number;
  revision: number;
}> {
  const db = firestore();
  const book = await db.collection("books").doc(bookId).get();
  if (!book.exists) {
    throw new StoryBibleError("not-found", "Book not found.");
  }
  const profiles = await listStoryBibleCharacters(bookId);
  const refreshedBook = await db.collection("books").doc(bookId).get();
  const storedState = refreshedBook.data()?.storyBibleState;
  let hasManuscriptScenes = false;
  if (profiles.length === 0 && storedState !== "rebuild-required") {
    const chapters = await db.collection("books").doc(bookId).collection("chapters").get();
    for (const chapter of chapters.docs) {
      const scenes = await chapter.ref.collection("scenes").limit(1).get();
      if (!scenes.empty) {
        hasManuscriptScenes = true;
        break;
      }
    }
  }
  const state: StoryBibleMemoryState =
    storedState === "stale" || storedState === "rebuild-required"
      ? storedState
      : profiles.some(
            (profile) =>
              profile.migrationState === "legacy-fact" ||
              profile.verification === "stale" ||
              (profile.conflicts?.length ?? 0) > 0,
          )
        ? "stale"
        : profiles.length > 0
          ? "current"
          : hasManuscriptScenes
            ? "rebuild-required"
            : "empty";
  return {
    text: profiles.length > 0 ? buildCompactCharacterRoster(profiles, state) : "",
    state,
    characterCount: profiles.filter((profile) => !profile.archived).length,
    revision:
      typeof refreshedBook.data()?.storyBibleRevision === "number"
        ? (refreshedBook.data()?.storyBibleRevision as number)
        : 0,
  };
}

export async function reconcileStoryBibleSource(
  bookId: string,
  source: Omit<StoryBibleMemorySource, "id" | "extractedAt"> | undefined,
  location: { chapterId: string; sceneId: string; rebuildRequestId?: string },
): Promise<void> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const manifestId = sourceId(location.chapterId, location.sceneId);
  const manifestRef = bookRef
    .collection("memorySources")
    .doc(manifestId);

  await db.runTransaction(async (transaction) => {
    const [book, manifestsSnapshot, profilesSnapshot] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(bookRef.collection("memorySources")),
      transaction.get(bookRef.collection("characters")),
    ]);
    if (!book.exists) throw new StoryBibleError("not-found", "Book not found.");
    const existingProfiles = profilesSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as CharacterProfile,
    );
    if (existingProfiles.length > MAX_CHARACTER_PROFILES) {
      throw new StoryBibleError(
        "invalid-state",
        "Story Bible has too many character profiles for atomic reconciliation.",
      );
    }
    const resolvedSource = source
      ? {
          ...source,
          rebuildRequestId: location.rebuildRequestId,
          characters: resolveCharacterEvidenceKeys(source.characters, existingProfiles),
          extractedAt: FieldValue.serverTimestamp(),
          id: manifestId,
        }
      : undefined;
    const manifests = manifestsSnapshot.docs
      .filter((doc) => doc.id !== manifestId)
      .map((doc) => ({ id: doc.id, ...doc.data() }) as StoryBibleMemorySource);
    if (resolvedSource) manifests.push(resolvedSource);
    const existingById = new Map(existingProfiles.map((profile) => [profile.id, profile]));
    const keys = new Set(
      manifests.flatMap((manifest) =>
        manifest.characters.map((character) => character.characterKey),
      ),
    );
    for (const profile of existingProfiles) {
      if (
        profile.migrationState === "legacy-fact" ||
        Object.keys(profile.authorOverrides?.stableTraits ?? {}).length > 0 ||
        Object.keys(profile.authorOverrides?.currentState ?? {}).length > 0 ||
        profile.authorOverrides?.name ||
        profile.authorOverrides?.summary
      ) {
        keys.add(profile.id);
      }
    }

    if (keys.size > MAX_CHARACTER_PROFILES) {
      throw new StoryBibleError(
        "invalid-state",
        "Story Bible has too many characters for atomic reconciliation.",
      );
    }
    if (resolvedSource) transaction.set(manifestRef, resolvedSource);
    else transaction.delete(manifestRef);
    for (const key of keys) {
      const profile = materializeCharacterProfile(key, manifests, existingById.get(key));
      transaction.set(bookRef.collection("characters").doc(profile.id), profile);
    }
    for (const profile of existingProfiles) {
      if (!keys.has(profile.id)) {
        transaction.delete(bookRef.collection("characters").doc(profile.id));
      }
    }
    const data = book.data() ?? {};
    const work = reconciledStoryBibleWork({
      pendingSources: Array.isArray(data.storyBiblePendingSources)
        ? data.storyBiblePendingSources
        : [],
      failedSources: Array.isArray(data.storyBibleFailedSources)
        ? data.storyBibleFailedSources
        : [],
      priorState: data.storyBibleState as StoryBibleMemoryState | undefined,
      manifestId,
      sourcePresent: Boolean(source),
      rebuildRequestId: location.rebuildRequestId,
      activeRebuildRequestId:
        typeof data.storyBibleRebuildRequestId === "string"
          ? data.storyBibleRebuildRequestId
          : undefined,
    });
    transaction.update(bookRef, {
      storyBibleSourceRevision:
        (typeof data.storyBibleSourceRevision === "number" ? data.storyBibleSourceRevision : 0) + 1,
      storyBibleRevision:
        (typeof data.storyBibleRevision === "number" ? data.storyBibleRevision : 0) + 1,
      storyBiblePendingSources: work.pendingSources,
      storyBibleFailedSources: work.failedSources,
      storyBibleState: work.state,
      storyBibleUpdatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function markStoryBibleStale(
  bookId: string,
  state: Extract<StoryBibleMemoryState, "stale" | "rebuild-required"> = "stale",
  location?: { chapterId: string; sceneId: string },
): Promise<void> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  await db.runTransaction(async (transaction) => {
    const book = await transaction.get(bookRef);
    if (!book.exists) return;
    const data = book.data() ?? {};
    const failed = new Set(
      Array.isArray(data.storyBibleFailedSources) ? data.storyBibleFailedSources : [],
    );
    if (location) failed.add(sourceId(location.chapterId, location.sceneId));
    transaction.update(bookRef, {
      storyBibleState:
        data.storyBibleState === "rebuild-required" || state === "rebuild-required"
          ? "rebuild-required"
          : "stale",
      storyBibleFailedSources: [...failed].slice(0, MAX_REBUILD_SCENES),
      storyBibleRevision:
        (typeof data.storyBibleRevision === "number" ? data.storyBibleRevision : 0) + 1,
      storyBibleUpdatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function requestStoryBibleRebuild(bookId: string): Promise<{ sceneCount: number }> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const book = await bookRef.get();
  if (!book.exists) throw new StoryBibleError("not-found", "Book not found.");

  const chapters = await bookRef.collection("chapters").orderBy("order", "asc").get();
  const targets: Array<{
    sceneRef: FirebaseFirestore.DocumentReference;
    taskRef: FirebaseFirestore.DocumentReference;
  }> = [];
  for (const chapter of chapters.docs) {
    const scenes = await chapter.ref.collection("scenes").orderBy("order", "asc").get();
    for (const scene of scenes.docs) {
      const text = scene.data().text;
      if (typeof text !== "string" || !text.trim()) continue;
      targets.push({
        sceneRef: scene.ref,
        taskRef: bookRef
          .collection("automation")
          .doc(storyBibleExtractionTaskId(chapter.id, scene.id, text)),
      });
      if (targets.length > MAX_REBUILD_SCENES) {
        throw new StoryBibleError(
          "invalid-state",
          `Story Bible rebuild supports at most ${MAX_REBUILD_SCENES} manuscript scenes.`,
        );
      }
    }
  }

  if (targets.length === 0) {
    await bookRef.update({
      storyBibleState: "empty",
      storyBiblePendingSources: [],
      storyBibleFailedSources: [],
      storyBibleRevision: FieldValue.increment(1),
      storyBibleUpdatedAt: FieldValue.serverTimestamp(),
    });
    return { sceneCount: 0 };
  }

  const requestId = randomUUID();
  const targetManifestIds = new Set(
    targets.map((target) => {
      const parts = target.sceneRef.path.split("/");
      return sourceId(parts[3] ?? "", parts[5] ?? "");
    }),
  );
  const existingManifests = await bookRef.collection("memorySources").get();
  const orphanManifests = existingManifests.docs.filter((doc) => !targetManifestIds.has(doc.id));
  await bookRef.update({
    storyBibleState: "rebuild-required",
    storyBibleRebuildRequestId: requestId,
    storyBiblePendingSources: [...targetManifestIds],
    storyBibleFailedSources: [],
    storyBibleRevision: FieldValue.increment(1),
    storyBibleUpdatedAt: FieldValue.serverTimestamp(),
  });
  for (let offset = 0; offset < orphanManifests.length; offset += 400) {
    const batch = db.batch();
    for (const orphan of orphanManifests.slice(offset, offset + 400)) {
      batch.delete(orphan.ref);
    }
    await batch.commit();
  }
  for (let offset = 0; offset < targets.length; offset += 150) {
    const batch = db.batch();
    for (const target of targets.slice(offset, offset + 150)) {
      batch.delete(target.taskRef);
      batch.update(target.sceneRef, {
        storyBibleRebuildRequestId: requestId,
        storyBibleRebuildRequestedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { sceneCount: targets.length };
}

export async function updateStoryBibleCharacter(
  bookId: string,
  characterId: string,
  expectedVersion: number,
  patch: StoryBibleCharacterPatch,
): Promise<CharacterProfile> {
  const db = firestore();
  const bookRef = db.collection("books").doc(bookId);
  const ref = bookRef.collection("characters").doc(characterId);

  return db.runTransaction(async (transaction) => {
    const [book, snapshot, manifestsSnapshot] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(ref),
      transaction.get(bookRef.collection("memorySources")),
    ]);
    if (!book.exists) throw new StoryBibleError("not-found", "Book not found.");
    if (!snapshot.exists) {
      throw new StoryBibleError("not-found", "Character not found.");
    }
    const existing = { id: snapshot.id, ...snapshot.data() } as CharacterProfile;
    if (existing.version !== expectedVersion) {
      throw new StoryBibleError(
        "version-conflict",
        "This character changed after you opened it. Reload and try again.",
      );
    }

    const normalizedLockedFields = [
      ...new Set(patch.lockedFields.map(normalizedLockPath).filter(Boolean)),
    ].sort();
    const normalizedStableTraits = cleanRecord(patch.stableTraits);
    const normalizedCurrentState = cleanRecord(patch.currentState);
    const seeded: CharacterProfile = {
      ...existing,
      name: patch.name,
      aliases: [...patch.aliases],
      summary: patch.summary,
      authorOverrides: {
        name: patch.name,
        aliases: [...patch.aliases],
        summary: patch.summary,
        stableTraits: Object.fromEntries(
          Object.entries(normalizedStableTraits).filter(([field]) =>
            normalizedLockedFields.includes(`stableTraits.${field}`),
          ),
        ),
        currentState: Object.fromEntries(
          Object.entries(normalizedCurrentState).filter(([field]) =>
            normalizedLockedFields.includes(`currentState.${field}`),
          ),
        ),
      },
      lockedFields: normalizedLockedFields,
      verification: "verified",
      migrationState: "native",
      archived: patch.archived,
    };
    const manifests = manifestsSnapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as StoryBibleMemorySource,
    );
    const materialized = materializeCharacterProfile(characterId, manifests, seeded);
    materialized.name = patch.name;
    materialized.aliases = [...patch.aliases];
    materialized.summary = patch.summary;
    materialized.stableTraits = normalizedStableTraits;
    materialized.currentState = normalizedCurrentState;
    materialized.archived = patch.archived;
    materialized.verification = materialized.conflicts.length > 0 ? "unverified" : "verified";
    transaction.set(ref, materialized);
    const data = book.data() ?? {};
    transaction.update(bookRef, {
      storyBibleRevision:
        (typeof data.storyBibleRevision === "number" ? data.storyBibleRevision : 0) + 1,
      storyBibleUpdatedAt: FieldValue.serverTimestamp(),
    });
    return materialized;
  });
}

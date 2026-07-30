import { authenticatedFetch } from "./api";

export type StoryBibleMemoryState = "empty" | "current" | "stale" | "rebuild-required";
export type StoryBibleVerification = "verified" | "unverified" | "stale";

export type StoryBibleSource = {
  chapterId: string;
  sceneId: string;
  excerpt: string;
};

export type StoryBibleTimelineEvent = {
  id: string;
  label: string;
  description: string;
  chronology: "present" | "historical" | "ambiguous";
  source: StoryBibleSource;
};

export type StoryBibleConflict = {
  field: string;
  canonicalValue: string;
  evidenceValue: string;
  source: StoryBibleSource;
};

export type StoryBibleCharacter = {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  stableTraits: Record<string, string>;
  currentState: Record<string, string>;
  timeline: StoryBibleTimelineEvent[];
  sources: StoryBibleSource[];
  conflicts: StoryBibleConflict[];
  authorOverrides: {
    name?: string;
    aliases?: string[];
    summary?: string;
    stableTraits: Record<string, string>;
    currentState: Record<string, string>;
  };
  lockedFields: string[];
  verification: StoryBibleVerification;
  migrationState: "native" | "legacy-fact";
  archived: boolean;
  version: number;
};

export type StoryBibleResponse = {
  book: { bookId: string; title: string };
  memoryState: StoryBibleMemoryState;
  characters: StoryBibleCharacter[];
};

export class StoryBibleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "StoryBibleApiError";
  }
}

async function bodyOrUndefined(response: Response): Promise<Record<string, unknown> | undefined> {
  const body = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : undefined;
}

export async function fetchStoryBible(bookId: string): Promise<StoryBibleResponse> {
  const response = await authenticatedFetch("/getStoryBible", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });
  const body = await bodyOrUndefined(response);
  if (!response.ok) {
    const message =
      response.status === 401
        ? "You don't have access to this book."
        : response.status === 404
          ? "This book could not be found."
          : "Could not load the Story Bible.";
    throw new StoryBibleApiError(
      typeof body?.message === "string" ? body.message : message,
      response.status,
    );
  }
  return body as unknown as StoryBibleResponse;
}

export async function rebuildStoryBible(
  bookId: string,
): Promise<{ status: "started"; sceneCount: number }> {
  const response = await authenticatedFetch("/rebuildStoryBible", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });
  const body = await bodyOrUndefined(response);
  if (!response.ok) {
    throw new StoryBibleApiError(
      typeof body?.message === "string"
        ? body.message
        : "Could not start building memory from this manuscript.",
      response.status,
    );
  }
  return body as { status: "started"; sceneCount: number };
}

export type StoryBibleCharacterUpdate = Pick<
  StoryBibleCharacter,
  "name" | "aliases" | "summary" | "stableTraits" | "currentState" | "lockedFields" | "archived"
>;

export async function saveStoryBibleCharacter(
  bookId: string,
  characterId: string,
  expectedVersion: number,
  character: StoryBibleCharacterUpdate,
): Promise<StoryBibleCharacter> {
  const response = await authenticatedFetch("/updateStoryBibleCharacter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, characterId, expectedVersion, character }),
  });
  const body = await bodyOrUndefined(response);
  if (!response.ok) {
    const fallback =
      response.status === 409
        ? "This character changed after you opened it. Reload before saving."
        : "Could not save this character.";
    throw new StoryBibleApiError(
      typeof body?.message === "string" ? body.message : fallback,
      response.status,
    );
  }
  return body?.character as StoryBibleCharacter;
}

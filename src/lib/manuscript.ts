import { useQuery } from "@tanstack/react-query";

import { authenticatedFetch } from "./api";

export type ManuscriptScene = {
  sceneId: string;
  order: number;
  text: string;
};

export type ManuscriptChapter = {
  chapterId: string;
  order: number;
  title: string;
  scenes: ManuscriptScene[];
};

export type BookManuscript = {
  bookId: string;
  title: string;
  chapters: ManuscriptChapter[];
  sceneCount: number;
  wordCount: number;
};

export type ManuscriptChapterEdit = {
  chapterId: string;
  originalTitle: string;
  draftTitle: string;
  scenes: Array<{
    sceneId: string;
    originalText: string;
    draftText: string;
  }>;
};

export type SavedManuscriptChapter = {
  chapterId: string;
  title: string;
  scenes: Array<{ sceneId: string; text: string }>;
};

export class ManuscriptEditApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ManuscriptEditApiError";
  }
}

function isScene(value: unknown): value is ManuscriptScene {
  if (typeof value !== "object" || value === null) return false;
  const scene = value as Partial<ManuscriptScene>;
  return (
    typeof scene.sceneId === "string" &&
    typeof scene.order === "number" &&
    typeof scene.text === "string"
  );
}

function isChapter(value: unknown): value is ManuscriptChapter {
  if (typeof value !== "object" || value === null) return false;
  const chapter = value as Partial<ManuscriptChapter>;
  return (
    typeof chapter.chapterId === "string" &&
    typeof chapter.order === "number" &&
    typeof chapter.title === "string" &&
    Array.isArray(chapter.scenes) &&
    chapter.scenes.every(isScene)
  );
}

function isManuscript(value: unknown): value is BookManuscript {
  if (typeof value !== "object" || value === null) return false;
  const manuscript = value as Partial<BookManuscript>;
  return (
    typeof manuscript.bookId === "string" &&
    typeof manuscript.title === "string" &&
    Array.isArray(manuscript.chapters) &&
    manuscript.chapters.every(isChapter) &&
    typeof manuscript.sceneCount === "number" &&
    typeof manuscript.wordCount === "number"
  );
}

export async function fetchManuscript(bookId: string): Promise<BookManuscript> {
  const response = await authenticatedFetch("/getManuscript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId }),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "This manuscript could not be found."
        : "Could not load this manuscript.",
    );
  }

  const body = (await response.json()) as { manuscript?: unknown };
  if (!isManuscript(body.manuscript)) {
    throw new Error("The manuscript response was invalid.");
  }
  return body.manuscript;
}

function isSavedChapter(value: unknown): value is SavedManuscriptChapter {
  if (typeof value !== "object" || value === null) return false;
  const chapter = value as Partial<SavedManuscriptChapter>;
  return (
    typeof chapter.chapterId === "string" &&
    typeof chapter.title === "string" &&
    Array.isArray(chapter.scenes) &&
    chapter.scenes.every(
      (scene) =>
        typeof scene === "object" &&
        scene !== null &&
        typeof scene.sceneId === "string" &&
        typeof scene.text === "string",
    )
  );
}

export async function enhanceManuscriptChapter(
  bookId: string,
  edit: ManuscriptChapterEdit,
): Promise<SavedManuscriptChapter> {
  const response = await authenticatedFetch("/enhanceManuscriptChapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId, ...edit }),
  });
  const body = (await response.json().catch(() => undefined)) as
    | { chapter?: unknown; message?: unknown }
    | undefined;

  if (!response.ok) {
    const fallback =
      response.status === 409
        ? "This chapter changed after you opened it. Reload and try again."
        : response.status === 502
          ? "WEAVE could not enhance this chapter. Your draft was not saved."
          : "Could not save this chapter.";
    throw new ManuscriptEditApiError(
      typeof body?.message === "string" ? body.message : fallback,
      response.status,
    );
  }
  if (!isSavedChapter(body?.chapter)) {
    throw new ManuscriptEditApiError("The saved chapter response was invalid.", response.status);
  }
  return body.chapter;
}

export function manuscriptQueryKey(bookId: string) {
  return ["manuscript", bookId] as const;
}

export function useManuscript(bookId: string) {
  return useQuery({
    queryKey: manuscriptQueryKey(bookId),
    queryFn: () => fetchManuscript(bookId),
    staleTime: 10_000,
  });
}

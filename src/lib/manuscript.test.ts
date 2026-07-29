import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
}));

vi.mock("./api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import { enhanceManuscriptChapter, fetchManuscript, ManuscriptEditApiError } from "./manuscript";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const manuscript = {
  bookId: "book-1",
  title: "The Long Road",
  chapters: [
    {
      chapterId: "chapter-1",
      order: 0,
      title: "Chapter 1",
      scenes: [{ sceneId: "scene-1", order: 0, text: "The road began." }],
    },
  ],
  sceneCount: 1,
  wordCount: 3,
};

describe("manuscript API", () => {
  beforeEach(() => authenticatedFetchMock.mockReset());

  it("loads an ordered manuscript through the authenticated endpoint", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ manuscript }));

    await expect(fetchManuscript("book-1")).resolves.toEqual(manuscript);
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/getManuscript",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bookId: "book-1" }),
      }),
    );
  });

  it("rejects malformed manuscript data", async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ manuscript: { ...manuscript, chapters: [{ order: "first" }] } }),
    );

    await expect(fetchManuscript("book-1")).rejects.toThrow("The manuscript response was invalid.");
  });

  it("surfaces a missing manuscript distinctly", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ code: "not-found" }, 404));

    await expect(fetchManuscript("missing")).rejects.toThrow("This manuscript could not be found.");
  });

  it("enhances and saves a manuscript chapter", async () => {
    const edit = {
      chapterId: "chapter-1",
      originalTitle: "Chapter 1",
      draftTitle: "The Begining",
      scenes: [
        {
          sceneId: "scene-1",
          originalText: "The road began.",
          draftText: "The road, it began.",
        },
      ],
    };
    const chapter = {
      chapterId: "chapter-1",
      title: "The Beginning",
      scenes: [{ sceneId: "scene-1", text: "The road began." }],
    };
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ chapter }));

    await expect(enhanceManuscriptChapter("book-1", edit)).resolves.toEqual(chapter);
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/enhanceManuscriptChapter",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bookId: "book-1", ...edit }),
      }),
    );
  });

  it("surfaces edit conflicts without replacing the local draft", async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ message: "Reload before editing again." }, 409),
    );

    await expect(
      enhanceManuscriptChapter("book-1", {
        chapterId: "chapter-1",
        originalTitle: "Chapter 1",
        draftTitle: "Changed",
        scenes: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ManuscriptEditApiError>>({
        status: 409,
        message: "Reload before editing again.",
      }),
    );
  });
});

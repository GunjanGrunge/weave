import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
}));

vi.mock("./api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import { fetchManuscript } from "./manuscript";

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
});

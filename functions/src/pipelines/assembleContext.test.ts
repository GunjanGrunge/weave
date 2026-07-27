import { describe, it, expect, vi, beforeEach } from "vitest";

const { getActiveChapterScenesMock } = vi.hoisted(() => ({
  getActiveChapterScenesMock: vi.fn(),
}));

vi.mock("../services/books.js", () => ({
  getActiveChapterScenes: getActiveChapterScenesMock,
}));

import { assembleContext } from "./assembleContext.js";

describe("assembleContext", () => {
  beforeEach(() => {
    getActiveChapterScenesMock.mockReset();
  });

  it("returns the active chapter's scene text in order, never other chapters' text", async () => {
    getActiveChapterScenesMock.mockResolvedValue({
      chapterId: "chapter-1",
      scenes: [
        { text: "First scene.", order: 0 },
        { text: "Second scene.", order: 1 },
      ],
    });

    const result = await assembleContext("book-1");

    expect(result).toEqual({
      chapterId: "chapter-1",
      priorScenesText: ["First scene.", "Second scene."],
    });
  });

  it("degrades gracefully to an empty scene list when the chapter has no scenes yet", async () => {
    getActiveChapterScenesMock.mockResolvedValue({ chapterId: "chapter-1", scenes: [] });

    const result = await assembleContext("book-1");

    expect(result).toEqual({ chapterId: "chapter-1", priorScenesText: [] });
  });

  it("degrades gracefully when the book has no chapters at all", async () => {
    getActiveChapterScenesMock.mockResolvedValue({ chapterId: undefined, scenes: [] });

    const result = await assembleContext("book-without-chapters");

    expect(result).toEqual({ chapterId: undefined, priorScenesText: [] });
  });
});

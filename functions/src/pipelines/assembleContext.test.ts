import { describe, it, expect, vi, beforeEach } from "vitest";

const { getActiveChapterScenesMock, getBookMock } = vi.hoisted(() => ({
  getActiveChapterScenesMock: vi.fn(),
  getBookMock: vi.fn(),
}));

vi.mock("../services/books.js", () => ({
  getActiveChapterScenes: getActiveChapterScenesMock,
  getBook: getBookMock,
}));

import { assembleContext } from "./assembleContext.js";

describe("assembleContext", () => {
  beforeEach(() => {
    getActiveChapterScenesMock.mockReset();
    getBookMock.mockReset();
    getBookMock.mockResolvedValue({ manuscriptRevision: 4 });
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
      manuscriptRevision: 4,
    });
  });

  it("degrades gracefully to an empty scene list when the chapter has no scenes yet", async () => {
    getActiveChapterScenesMock.mockResolvedValue({ chapterId: "chapter-1", scenes: [] });

    const result = await assembleContext("book-1");

    expect(result).toEqual({
      chapterId: "chapter-1",
      priorScenesText: [],
      manuscriptRevision: 4,
    });
  });

  it("degrades gracefully when the book has no chapters at all", async () => {
    getActiveChapterScenesMock.mockResolvedValue({ chapterId: undefined, scenes: [] });

    const result = await assembleContext("book-without-chapters");

    expect(result).toEqual({
      chapterId: undefined,
      priorScenesText: [],
      manuscriptRevision: 4,
    });
  });

  it("uses revision zero for a legacy book", async () => {
    getBookMock.mockResolvedValue({ title: "Legacy" });
    getActiveChapterScenesMock.mockResolvedValue({ chapterId: "chapter-1", scenes: [] });

    await expect(assembleContext("legacy-book")).resolves.toMatchObject({
      manuscriptRevision: 0,
    });
  });

  it("retries when acceptance changes the manuscript during assembly", async () => {
    getBookMock
      .mockResolvedValueOnce({ manuscriptRevision: 1 })
      .mockResolvedValueOnce({ manuscriptRevision: 2 })
      .mockResolvedValueOnce({ manuscriptRevision: 2 })
      .mockResolvedValueOnce({ manuscriptRevision: 2 });
    getActiveChapterScenesMock
      .mockResolvedValueOnce({ chapterId: "chapter-1", scenes: [] })
      .mockResolvedValueOnce({
        chapterId: "chapter-1",
        scenes: [{ text: "Newly accepted scene." }],
      });

    await expect(assembleContext("book-1")).resolves.toEqual({
      chapterId: "chapter-1",
      priorScenesText: ["Newly accepted scene."],
      manuscriptRevision: 2,
    });
  });
});

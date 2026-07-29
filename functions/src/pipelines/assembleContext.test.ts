import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getActiveChapterScenesMock,
  getBookMock,
  getActiveChapterMock,
  getPreviousChapterLastScenesMock,
  getPriorChapterSummariesMock,
  retrieveRelevantFactsMock,
  readModelRegistryMock,
  embedContentMock,
  recordUsageBestEffortMock,
} = vi.hoisted(() => ({
  getActiveChapterScenesMock: vi.fn(),
  getBookMock: vi.fn(),
  getActiveChapterMock: vi.fn(),
  getPreviousChapterLastScenesMock: vi.fn(),
  getPriorChapterSummariesMock: vi.fn(),
  retrieveRelevantFactsMock: vi.fn(),
  readModelRegistryMock: vi.fn(),
  embedContentMock: vi.fn(),
  recordUsageBestEffortMock: vi.fn(),
}));

vi.mock("../services/books.js", () => ({
  getActiveChapterScenes: getActiveChapterScenesMock,
  getBook: getBookMock,
  getActiveChapter: getActiveChapterMock,
  getPreviousChapterLastScenes: getPreviousChapterLastScenesMock,
  getPriorChapterSummaries: getPriorChapterSummariesMock,
  retrieveRelevantFacts: retrieveRelevantFactsMock,
}));

vi.mock("../services/gemini.js", () => ({
  readModelRegistry: readModelRegistryMock,
  recordUsageBestEffort: recordUsageBestEffortMock,
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {
      embedContent: embedContentMock,
    },
  })),
}));

import { assembleContext } from "./assembleContext.js";
import type { SceneInput } from "../types/sceneInput.js";

describe("assembleContext", () => {
  beforeEach(() => {
    getActiveChapterScenesMock.mockReset();
    getBookMock.mockReset();
    getActiveChapterMock.mockReset();
    getPreviousChapterLastScenesMock.mockReset();
    getPriorChapterSummariesMock.mockReset();
    retrieveRelevantFactsMock.mockReset();
    readModelRegistryMock.mockReset();
    embedContentMock.mockReset();
    recordUsageBestEffortMock.mockReset();

    getBookMock.mockResolvedValue({ manuscriptRevision: 4 });
    getActiveChapterMock.mockResolvedValue({ id: "chapter-2", order: 1 });
    getActiveChapterScenesMock.mockResolvedValue({
      chapterId: "chapter-2",
      scenes: [{ text: "Scene in active chapter." }],
    });
    getPreviousChapterLastScenesMock.mockResolvedValue([
      { text: "Scene in previous chapter." },
    ]);
    getPriorChapterSummariesMock.mockResolvedValue(["Prior summary."]);
    retrieveRelevantFactsMock.mockResolvedValue(["Relevant fact."]);
    readModelRegistryMock.mockResolvedValue({
      embedding: { model: "text-embedding-004", outputDimensionality: 768 },
    });
    embedContentMock.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2] }],
    });
  });

  it("returns active scenes, previous scenes, prior summaries, and nearest facts in happy path", async () => {
    const input: SceneInput = { mode: "free-text", description: "Write next scene." };
    const apiKeys = { gemini: "fake-key", openai: "" };

    const result = await assembleContext("book-1", input, apiKeys);

    expect(result).toEqual({
      chapterId: "chapter-2",
      priorScenesText: ["Scene in active chapter."],
      lastScenesText: ["Scene in previous chapter."],
      priorChapterSummaries: ["Prior summary."],
      relevantFactsText: ["Relevant fact."],
      manuscriptRevision: 4,
    });

    expect(getActiveChapterMock).toHaveBeenCalledWith("book-1");
    expect(getPreviousChapterLastScenesMock).toHaveBeenCalledWith("book-1", 1);
    expect(getPriorChapterSummariesMock).toHaveBeenCalledWith("book-1", 1);
    expect(embedContentMock).toHaveBeenCalledWith({
      model: "text-embedding-004",
      contents: "Write next scene.",
      config: { outputDimensionality: 768 },
    });
    expect(retrieveRelevantFactsMock).toHaveBeenCalledWith("book-1", [0.1, 0.2]);
  });

  it("degrades gracefully to empty arrays when embed content fails", async () => {
    embedContentMock.mockRejectedValue(new Error("API down"));
    const input: SceneInput = { mode: "free-text", description: "Write next scene." };
    const apiKeys = { gemini: "fake-key", openai: "" };

    const result = await assembleContext("book-1", input, apiKeys);

    expect(result).toEqual({
      chapterId: "chapter-2",
      priorScenesText: ["Scene in active chapter."],
      lastScenesText: ["Scene in previous chapter."],
      priorChapterSummaries: ["Prior summary."],
      relevantFactsText: [],
      manuscriptRevision: 4,
    });
    expect(retrieveRelevantFactsMock).not.toHaveBeenCalled();
  });

  it("degrades gracefully to empty arrays when previous chapter or prior summaries load fails", async () => {
    getPreviousChapterLastScenesMock.mockRejectedValue(new Error("Firestore down"));
    const input: SceneInput = { mode: "free-text", description: "Write next scene." };
    const apiKeys = { gemini: "fake-key", openai: "" };

    const result = await assembleContext("book-1", input, apiKeys);

    expect(result).toEqual({
      chapterId: "chapter-2",
      priorScenesText: ["Scene in active chapter."],
      lastScenesText: [],
      priorChapterSummaries: [],
      relevantFactsText: ["Relevant fact."],
      manuscriptRevision: 4,
    });
  });

  it("does not query history or facts if input or apiKeys are not provided (Epic 2 fallback path)", async () => {
    const result = await assembleContext("book-1");

    expect(result).toEqual({
      chapterId: "chapter-2",
      priorScenesText: ["Scene in active chapter."],
      lastScenesText: ["Scene in previous chapter."],
      priorChapterSummaries: ["Prior summary."],
      relevantFactsText: [],
      manuscriptRevision: 4,
    });
    expect(embedContentMock).not.toHaveBeenCalled();
    expect(retrieveRelevantFactsMock).not.toHaveBeenCalled();
  });

  it("does not fetch previous scenes or summaries if the active chapter is the first one (order === 0)", async () => {
    getActiveChapterMock.mockResolvedValue({ id: "chapter-1", order: 0 });

    const result = await assembleContext("book-1");

    expect(result).toEqual({
      chapterId: "chapter-2",
      priorScenesText: ["Scene in active chapter."],
      lastScenesText: [],
      priorChapterSummaries: [],
      relevantFactsText: [],
      manuscriptRevision: 4,
    });
    expect(getPreviousChapterLastScenesMock).not.toHaveBeenCalled();
    expect(getPriorChapterSummariesMock).not.toHaveBeenCalled();
  });
});

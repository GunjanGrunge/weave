import { beforeEach, describe, expect, it, vi } from "vitest";

const { callWithFallbackMock, readModelRegistryMock, recordUsageMock } = vi.hoisted(() => ({
  callWithFallbackMock: vi.fn(),
  readModelRegistryMock: vi.fn(),
  recordUsageMock: vi.fn(),
}));

vi.mock("./gemini.js", () => ({
  callWithFallback: callWithFallbackMock,
  readModelRegistry: readModelRegistryMock,
  recordUsageBestEffort: recordUsageMock,
}));
vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

const docs = new Map<string, Record<string, unknown>>();

function docRef(path: string) {
  return {
    path,
    get: vi.fn(async () => ({
      exists: docs.has(path),
      data: () => docs.get(path),
    })),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

function collectionRef(path: string) {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
  };
}

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: vi.fn(() => "server-time") },
  getFirestore: vi.fn(() => ({
    collection: (name: string) => collectionRef(name),
    runTransaction: async (
      callback: (transaction: {
        get: (ref: ReturnType<typeof docRef>) => Promise<{
          exists: boolean;
          data: () => Record<string, unknown> | undefined;
        }>;
        update: (ref: ReturnType<typeof docRef>, patch: Record<string, unknown>) => void;
      }) => Promise<unknown>,
    ) =>
      callback({
        get: async (ref) => ({
          exists: docs.has(ref.path),
          data: () => docs.get(ref.path),
        }),
        update: (ref, patch) => {
          docs.set(ref.path, { ...docs.get(ref.path), ...patch });
        },
      }),
  })),
}));

import {
  commitChapterEdit,
  enhanceChapterEdit,
  ManuscriptEditError,
  prepareChapterEdit,
  type ManuscriptChapterEdit,
} from "./manuscriptEditor.js";

const request: ManuscriptChapterEdit = {
  chapterId: "chapter-1",
  originalTitle: "Chapter 1",
  draftTitle: "The Begining of the King",
  scenes: [
    {
      sceneId: "scene-1",
      originalText: "He laid down his loupe.",
      draftText: "He laid down with his book and his loupe.",
    },
    {
      sceneId: "scene-2",
      originalText: "The room was quiet.",
      draftText: "The room was quiet.",
    },
  ],
};

describe("manuscript editor service", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("books/book-1", { manuscriptRevision: 3 });
    docs.set("books/book-1/chapters/chapter-1", { order: 0, nextSceneOrder: 2 });
    docs.set("books/book-1/chapters/chapter-1/scenes/scene-1", {
      order: 0,
      text: request.scenes[0]!.originalText,
      sourceSessionId: "session-1",
    });
    docs.set("books/book-1/chapters/chapter-1/scenes/scene-2", {
      order: 1,
      text: request.scenes[1]!.originalText,
    });
    docs.set("books/book-1/sessions/session-1", {
      messageId: "message-1",
      candidate: { text: request.scenes[0]!.originalText },
    });
    docs.set("books/book-1/messages/message-1", {
      text: request.scenes[0]!.originalText,
      status: "accepted",
    });
    callWithFallbackMock.mockReset();
    readModelRegistryMock.mockReset();
    recordUsageMock.mockReset();
    readModelRegistryMock.mockResolvedValue({
      generate: { primary: { provider: "openai", model: "gpt-test" } },
    });
  });

  it("prepares only changed title and prose", async () => {
    await expect(prepareChapterEdit("book-1", request)).resolves.toEqual({
      chapterId: "chapter-1",
      originalTitle: "Chapter 1",
      titleDraft: "The Begining of the King",
      scenes: [request.scenes[0]],
    });
  });

  it("rejects stale scene text before calling the model", async () => {
    docs.set("books/book-1/chapters/chapter-1/scenes/scene-1", {
      order: 0,
      text: "A newer edit.",
    });

    await expect(prepareChapterEdit("book-1", request)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("enhances with structured output and records usage", async () => {
    const prepared = await prepareChapterEdit("book-1", request);
    callWithFallbackMock.mockResolvedValue({
      text: JSON.stringify({
        title: "The Beginning of the King",
        scenes: [
          {
            sceneId: "scene-1",
            text: "He laid down his book beside his loupe.",
          },
        ],
      }),
      provider: "openai",
      model: "gpt-test",
      inputTokens: 30,
      outputTokens: 20,
    });

    const result = await enhanceChapterEdit(
      "book-1",
      prepared,
      { presetIds: ["warm-character-driven"] },
      { openai: "key", gemini: "key" },
    );

    expect(result).toMatchObject({
      title: "The Beginning of the King",
      scenes: [{ sceneId: "scene-1", text: "He laid down his book beside his loupe." }],
      provider: "openai",
    });
    expect(callWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ primary: { provider: "openai", model: "gpt-test" } }),
      { openai: "key", gemini: "key" },
      expect.stringContaining("Correct spelling, grammar, punctuation"),
      expect.objectContaining({ name: "manuscript_chapter_edit" }),
    );
    expect(recordUsageMock).toHaveBeenCalledWith(
      "book-1",
      "manuscriptEdit",
      expect.objectContaining({ model: "gpt-test" }),
    );
  });

  it("rejects incomplete model output", async () => {
    const prepared = await prepareChapterEdit("book-1", request);
    callWithFallbackMock.mockResolvedValue({
      text: JSON.stringify({ title: "Fixed", scenes: [] }),
      provider: "openai",
      model: "gpt-test",
      inputTokens: 1,
      outputTokens: 1,
    });

    await expect(
      enhanceChapterEdit(
        "book-1",
        prepared,
        { presetIds: [] },
        { openai: "key", gemini: "key" },
      ),
    ).rejects.toBeInstanceOf(ManuscriptEditError);
  });

  it("atomically saves enhanced fields and advances manuscript revision", async () => {
    const enhanced = {
      title: "The Beginning of the King",
      scenes: [{ sceneId: "scene-1", text: "He laid down his book beside his loupe." }],
      provider: "openai" as const,
      model: "gpt-test",
    };

    await expect(commitChapterEdit("book-1", request, enhanced)).resolves.toEqual({
      chapterId: "chapter-1",
      title: "The Beginning of the King",
      scenes: enhanced.scenes,
    });
    expect(docs.get("books/book-1")).toMatchObject({ manuscriptRevision: 4 });
    expect(docs.get("books/book-1/chapters/chapter-1")).toMatchObject({
      title: "The Beginning of the King",
    });
    expect(docs.get("books/book-1/chapters/chapter-1/scenes/scene-1")).toMatchObject({
      text: "He laid down his book beside his loupe.",
      editProvider: "openai",
      editModel: "gpt-test",
    });
    expect(docs.get("books/book-1/sessions/session-1")).toMatchObject({
      "candidate.text": "He laid down his book beside his loupe.",
    });
    expect(docs.get("books/book-1/messages/message-1")).toMatchObject({
      text: "He laid down his book beside his loupe.",
      status: "accepted",
    });
    expect(docs.get("books/book-1/chapters/chapter-1/scenes/scene-2")).toMatchObject({
      text: "The room was quiet.",
    });
  });
});

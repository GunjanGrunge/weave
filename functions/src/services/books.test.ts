import { describe, it, expect, vi, beforeEach } from "vitest";

type WriteCall = { path: string; data: unknown };

const { setCalls, updateCalls, commitMock, serverTimestampMock } = vi.hoisted(() => ({
  setCalls: [] as WriteCall[],
  updateCalls: [] as WriteCall[],
  commitMock: vi.fn(),
  serverTimestampMock: vi.fn(() => "server-time"),
}));

type StoredDoc = { id?: string; order: number } & Record<string, unknown>;

let docStore: Record<string, unknown> = {};
let messagesStore: Record<string, StoredDoc[]> = {};
let chaptersStore: Record<string, StoredDoc[]> = {};
let scenesStore: Record<string, StoredDoc[]> = {};

function collectionData(path: string): StoredDoc[] {
  if (path.endsWith("/messages")) return messagesStore[path] ?? [];
  if (path.endsWith("/chapters")) return chaptersStore[path] ?? [];
  if (path.endsWith("/scenes")) return scenesStore[path] ?? [];
  return [];
}

function makeDoc(path: string) {
  return {
    id: path.split("/").at(-1),
    path,
    collection: (name: string) => makeCollection(`${path}/${name}`),
    get: async () => ({
      exists: docStore[path] !== undefined,
      data: () => docStore[path],
    }),
    set: async (data: unknown) => {
      setCalls.push({ path, data });
      docStore[path] = data;
    },
    update: async (data: unknown) => {
      updateCalls.push({ path, data });
      docStore[path] = { ...(docStore[path] as Record<string, unknown> | undefined), ...(data as object) };
    },
  };
}

function makeCollection(path: string) {
  const sortedDocs = (direction: "asc" | "desc") => {
    const list = collectionData(path);
    return [...list].sort((a, b) => (direction === "desc" ? b.order - a.order : a.order - b.order));
  };

  return {
    doc: (id?: string) => makeDoc(`${path}/${id ?? "book-auto-id"}`),
    orderBy: (_field: string, direction: "asc" | "desc" = "asc") => ({
      get: async () => {
        const docs = sortedDocs(direction).map((item) => ({ id: item.id, data: () => item }));
        return { empty: docs.length === 0, docs };
      },
      limit: (n: number) => ({
        get: async () => {
          const docs = sortedDocs(direction)
            .slice(0, n)
            .map((item) => ({ id: item.id, data: () => item }));
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
  };
}

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: serverTimestampMock },
  getFirestore: vi.fn(() => ({
    collection: (name: string) => makeCollection(name),
    batch: () => {
      const pending: WriteCall[] = [];
      return {
        set: (ref: { path: string }, data: unknown) => {
          setCalls.push({ path: ref.path, data });
          pending.push({ path: ref.path, data });
        },
        commit: async () => {
          // Real batch writes only become visible to subsequent reads once
          // committed — apply them to docStore here so idempotency lookups
          // against docs written by a prior batch behave like real Firestore.
          for (const { path, data } of pending) {
            docStore[path] = data;
          }
          return commitMock();
        },
      };
    },
    runTransaction: async <T,>(
      updateFn: (transaction: {
        get: (query: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { path: string }, data: unknown) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      const transaction = {
        get: (query: { get: () => Promise<unknown> }) => query.get(),
        set: (ref: { path: string }, data: unknown) => {
          setCalls.push({ path: ref.path, data });
          docStore[ref.path] = data;
          const parentPath = ref.path.split("/").slice(0, -1).join("/");
          if (parentPath.endsWith("/messages")) {
            messagesStore[parentPath] = [
              ...(messagesStore[parentPath] ?? []),
              data as StoredDoc,
            ];
          }
        },
      };
      return updateFn(transaction);
    },
  })),
}));

import {
  appendChatMessage,
  claimOpeningSuggestionAttempt,
  createBookWithIntake,
  getActiveChapterScenes,
  getBook,
  getMessages,
  getVisionDocument,
  resolveOpeningSuggestionAttempt,
  updateVisionDocument,
  upsertOpeningSuggestionMessage,
} from "./books.js";
import { DEFAULT_STYLE_PRESET_ID } from "../config/stylePresets.js";

describe("createBookWithIntake", () => {
  beforeEach(() => {
    setCalls.length = 0;
    docStore = {};
    messagesStore = {};
    commitMock.mockReset();
    commitMock.mockResolvedValue(undefined);
    serverTimestampMock.mockClear();
  });

  it("creates exactly one Book, Chapter, Vision doc, and intake message set in one batch", async () => {
    const result = await createBookWithIntake("user-a", {
      premiseAnswers: {
        whatToWrite: "A locked-room mystery in a floating hotel",
        mainCharacter: "Ira, a tired concierge",
        roughPremise: "Guests vanish whenever the hotel changes altitude.",
      },
      style: { presetIds: ["sparse-cinematic", "fast-paced-thriller"] },
    });

    expect(result).toEqual({ bookId: "book-auto-id" });
    expect(commitMock).toHaveBeenCalledTimes(1);

    const bookWrites = setCalls.filter((call) => call.path === "books/book-auto-id");
    const chapterWrites = setCalls.filter((call) =>
      call.path.startsWith("books/book-auto-id/chapters/"),
    );
    const visionWrites = setCalls.filter((call) => call.path === "books/book-auto-id/vision/main");
    const messageWrites = setCalls.filter((call) =>
      call.path.startsWith("books/book-auto-id/messages/"),
    );

    expect(bookWrites).toHaveLength(1);
    expect(chapterWrites).toHaveLength(1);
    expect(visionWrites).toHaveLength(1);
    expect(messageWrites).toHaveLength(8);
    expect(bookWrites[0]?.data).toMatchObject({
      uid: "user-a",
      style: { presetIds: ["sparse-cinematic", "fast-paced-thriller"] },
    });
    expect(chapterWrites[0]?.data).toMatchObject({ order: 0 });
    expect(visionWrites[0]?.data).toMatchObject({
      premise: "Guests vanish whenever the hotel changes altitude.",
      characterIntents: ["Ira, a tired concierge"],
      structureMap: [],
      guidanceDial: "normal",
      threads: [],
    });
  });

  it("defaults skipped premise fields to empty strings and applies the fixed default style", async () => {
    await createBookWithIntake("user-a", {
      premiseAnswers: {},
      style: { presetIds: [] },
    });

    const book = setCalls.find((call) => call.path === "books/book-auto-id")?.data;
    const vision = setCalls.find((call) => call.path === "books/book-auto-id/vision/main")?.data;

    expect(book).toMatchObject({
      title: "Untitled Book",
      style: { presetIds: [DEFAULT_STYLE_PRESET_ID] },
    });
    expect(vision).toEqual(
      expect.objectContaining({
        theme: "",
        premise: "",
        characterIntents: [],
        structureMap: [],
        guidanceDial: "normal",
        threads: [],
      }),
    );
    expect(JSON.stringify(vision)).not.toContain("undefined");
  });

  it("persists ordered system/user intake messages with the required type discriminators", async () => {
    await createBookWithIntake("user-a", {
      premiseAnswers: { whatToWrite: "A novella" },
      style: {
        presetIds: ["warm-character-driven"],
        customInstruction: "Quiet, reflective prose.",
      },
    });

    const messages = setCalls
      .filter((call) => call.path.startsWith("books/book-auto-id/messages/"))
      .map((call) => call.data as { type: string; text: string; order: number })
      .sort((a, b) => a.order - b.order);

    expect(messages.map((message) => message.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(messages.map((message) => message.type)).toEqual([
      "system",
      "user",
      "system",
      "user",
      "system",
      "user",
      "system",
      "user",
    ]);
    expect(messages[1]?.text).toBe("A novella");
    expect(messages[3]?.text).toBe("(skipped)");
    expect(messages[7]?.text).toContain("Warm & Character-Driven");
    expect(messages[7]?.text).toContain("Quiet, reflective prose.");
  });

  it("stores a pure custom instruction with no preset, without forcing the default preset", async () => {
    await createBookWithIntake("user-a", {
      premiseAnswers: {},
      style: { presetIds: [], customInstruction: "Terse, second-person, present tense." },
    });

    const book = setCalls.find((call) => call.path === "books/book-auto-id")?.data;

    expect(book).toMatchObject({
      style: {
        presetIds: [],
        customInstruction: "Terse, second-person, present tense.",
      },
    });
  });

  it("still applies the default preset when style is skipped entirely (no presets, no custom instruction)", async () => {
    await createBookWithIntake("user-a", {
      premiseAnswers: {},
      style: { presetIds: [] },
    });

    const book = setCalls.find((call) => call.path === "books/book-auto-id")?.data;

    expect(book).toMatchObject({ style: { presetIds: [DEFAULT_STYLE_PRESET_ID] } });
  });

  it("returns the original bookId on a replayed idempotency key instead of creating a duplicate book", async () => {
    const first = await createBookWithIntake("user-a", {
      premiseAnswers: { whatToWrite: "A heist novel" },
      style: { presetIds: ["fast-paced-thriller"] },
      idempotencyKey: "retry-key-1",
    });

    setCalls.length = 0;
    commitMock.mockClear();

    const second = await createBookWithIntake("user-a", {
      premiseAnswers: { whatToWrite: "A heist novel" },
      style: { presetIds: ["fast-paced-thriller"] },
      idempotencyKey: "retry-key-1",
    });

    expect(second).toEqual(first);
    expect(commitMock).not.toHaveBeenCalled();
    expect(setCalls).toHaveLength(0);
  });
});

describe("getBook", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("returns the book data when it exists", async () => {
    docStore["books/book-1"] = { uid: "user-a", title: "A heist", style: { presetIds: [] } };

    const book = await getBook("book-1");

    expect(book).toEqual({ uid: "user-a", title: "A heist", style: { presetIds: [] } });
  });

  it("returns undefined when the book does not exist", async () => {
    const book = await getBook("missing-book");

    expect(book).toBeUndefined();
  });
});

describe("getVisionDocument", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("returns the vision document when it exists", async () => {
    docStore["books/book-1/vision/main"] = {
      theme: "x",
      premise: "y",
      characterIntents: [],
      structureMap: [],
      guidanceDial: "normal",
      threads: [],
    };

    const vision = await getVisionDocument("book-1");

    expect(vision).toMatchObject({ theme: "x", premise: "y" });
  });

  it("returns undefined when the vision document does not exist", async () => {
    const vision = await getVisionDocument("missing-book");

    expect(vision).toBeUndefined();
  });
});

describe("updateVisionDocument", () => {
  beforeEach(() => {
    setCalls.length = 0;
    updateCalls.length = 0;
    docStore = {
      "books/book-1/vision/main": {
        theme: "old",
        premise: "old premise",
        characterIntents: [],
        structureMap: [{ beat: "Opening Image", sceneRef: "scene-1" }],
        guidanceDial: "normal",
        threads: [],
      },
    };
  });

  it("updates only editable vision fields via update(), never set()", async () => {
    const vision = await updateVisionDocument("book-1", {
      theme: "new",
      premise: "new premise",
      characterIntents: ["Mara"],
      threads: [],
    });

    expect(updateCalls).toEqual([
      {
        path: "books/book-1/vision/main",
        data: {
          theme: "new",
          premise: "new premise",
          characterIntents: ["Mara"],
          threads: [],
        },
      },
    ]);
    expect(setCalls).toHaveLength(0);
    expect(vision).toMatchObject({
      theme: "new",
      premise: "new premise",
      structureMap: [{ beat: "Opening Image", sceneRef: "scene-1" }],
      guidanceDial: "normal",
    });
  });
});

describe("upsertOpeningSuggestionMessage", () => {
  beforeEach(() => {
    setCalls.length = 0;
    docStore = {};
    messagesStore = {};
  });

  it("writes the opening suggestion to a deterministic message doc at the next order", async () => {
    messagesStore["books/book-1/messages"] = [{ order: 0 }, { order: 1 }, { order: 7 }];

    await upsertOpeningSuggestionMessage("book-1", "The Muse suggests...");

    const write = setCalls.find((call) => call.path === "books/book-1/messages/opening-suggestion");
    expect(write?.data).toMatchObject({
      type: "structural_note",
      text: "The Muse suggests...",
      order: 8,
    });
  });

  it("updates the existing opening suggestion message without creating another message order", async () => {
    docStore["books/book-1/messages/opening-suggestion"] = {
      type: "structural_note",
      text: "Old suggestion",
      order: 8,
    };
    messagesStore["books/book-1/messages"] = [{ order: 8 }, { order: 9 }];

    await upsertOpeningSuggestionMessage("book-1", "New suggestion");

    const write = setCalls.find((call) => call.path === "books/book-1/messages/opening-suggestion");
    expect(write?.data).toMatchObject({
      type: "structural_note",
      text: "New suggestion",
      order: 8,
    });
  });
});

describe("claimOpeningSuggestionAttempt / resolveOpeningSuggestionAttempt", () => {
  beforeEach(() => {
    setCalls.length = 0;
    docStore = {};
  });

  it("claims the attempt when no state exists yet", async () => {
    const claim = await claimOpeningSuggestionAttempt("book-1");

    expect(claim).toEqual({ shouldRun: true });
    expect(docStore["books/book-1/system/openingSuggestion"]).toMatchObject({ state: "pending" });
  });

  it("does not re-claim and returns the cached result once a prior attempt succeeded", async () => {
    docStore["books/book-1/system/openingSuggestion"] = {
      state: "ok",
      openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
    };

    const claim = await claimOpeningSuggestionAttempt("book-1");

    expect(claim).toEqual({
      shouldRun: false,
      existingResult: {
        status: "ok",
        openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
      },
    });
  });

  it("does not start a second attempt while one is still pending", async () => {
    docStore["books/book-1/system/openingSuggestion"] = { state: "pending" };

    const claim = await claimOpeningSuggestionAttempt("book-1");

    expect(claim).toEqual({ shouldRun: false, existingResult: { status: "failed", openings: [] } });
  });

  it("allows a new claim after a prior attempt failed", async () => {
    docStore["books/book-1/system/openingSuggestion"] = { state: "failed" };

    const claim = await claimOpeningSuggestionAttempt("book-1");

    expect(claim).toEqual({ shouldRun: true });
  });

  it("resolveOpeningSuggestionAttempt persists the final state and openings", async () => {
    await resolveOpeningSuggestionAttempt("book-1", "ok", [
      { text: "Open mid-heist.", rationale: "Immediate stakes." },
    ]);

    expect(docStore["books/book-1/system/openingSuggestion"]).toMatchObject({
      state: "ok",
      openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
    });
  });
});

describe("getMessages", () => {
  beforeEach(() => {
    messagesStore = {};
  });

  it("returns messages ordered ascending by order", async () => {
    messagesStore["books/book-1/messages"] = [
      { order: 2, type: "user", text: "third" },
      { order: 0, type: "system", text: "first" },
      { order: 1, type: "user", text: "second" },
    ];

    const messages = await getMessages("book-1");

    expect(messages.map((message) => message.text)).toEqual(["first", "second", "third"]);
  });

  it("returns an empty array when there are no messages", async () => {
    const messages = await getMessages("empty-book");

    expect(messages).toEqual([]);
  });
});

describe("appendChatMessage", () => {
  beforeEach(() => {
    setCalls.length = 0;
    messagesStore = {};
  });

  it("appends a message at the next order after the last message", async () => {
    messagesStore["books/book-1/messages"] = [{ order: 0 }, { order: 1 }];

    const message = await appendChatMessage("book-1", "assistant_scene", "A generated scene.");

    expect(message).toMatchObject({ type: "assistant_scene", text: "A generated scene.", order: 2 });
    const write = setCalls.find((call) => call.path === "books/book-1/messages/book-auto-id");
    expect(write?.data).toMatchObject({ type: "assistant_scene", order: 2 });
  });

  it("starts at order 0 when there are no existing messages", async () => {
    const message = await appendChatMessage("empty-book", "assistant_scene", "First scene.");

    expect(message.order).toBe(0);
  });

  it("assigns the last-order read and the write within one transaction, so sequential appends get distinct incrementing orders", async () => {
    const first = await appendChatMessage("book-1", "user", "First message.");
    const second = await appendChatMessage("book-1", "assistant_scene", "Second message.");

    expect(first.order).toBe(0);
    expect(second.order).toBe(1);
  });
});

describe("getActiveChapterScenes", () => {
  beforeEach(() => {
    chaptersStore = {};
    scenesStore = {};
  });

  it("returns scenes from the lowest-order chapter, ordered ascending", async () => {
    chaptersStore["books/book-1/chapters"] = [{ id: "chapter-1", order: 0 }];
    scenesStore["books/book-1/chapters/chapter-1/scenes"] = [
      { order: 1, text: "second scene", modelUsed: "gpt-5.6-sol", provider: "openai" },
      { order: 0, text: "first scene", modelUsed: "gpt-5.6-sol", provider: "openai" },
    ];

    const result = await getActiveChapterScenes("book-1");

    expect(result.chapterId).toBe("chapter-1");
    expect(result.scenes.map((scene) => scene.text)).toEqual(["first scene", "second scene"]);
  });

  it("returns an empty scenes array when the active chapter has no scenes yet", async () => {
    chaptersStore["books/book-1/chapters"] = [{ id: "chapter-1", order: 0 }];

    const result = await getActiveChapterScenes("book-1");

    expect(result.chapterId).toBe("chapter-1");
    expect(result.scenes).toEqual([]);
  });

  it("returns no chapterId when the book has no chapters", async () => {
    const result = await getActiveChapterScenes("book-without-chapters");

    expect(result.chapterId).toBeUndefined();
    expect(result.scenes).toEqual([]);
  });
});

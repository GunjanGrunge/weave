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
      docStore[path] = {
        ...(docStore[path] as Record<string, unknown> | undefined),
        ...(data as object),
      };
    },
    delete: async () => {
      delete docStore[path];
      const parts = path.split("/");
      const colPath = parts.slice(0, -1).join("/");
      const docId = parts.at(-1);
      if (colPath.endsWith("/messages") && messagesStore[colPath]) {
        messagesStore[colPath] = messagesStore[colPath].filter((d) => d.id !== docId);
      }
      if (colPath.endsWith("/chapters") && chaptersStore[colPath]) {
        chaptersStore[colPath] = chaptersStore[colPath].filter((d) => d.id !== docId);
      }
      if (colPath.endsWith("/scenes") && scenesStore[colPath]) {
        scenesStore[colPath] = scenesStore[colPath].filter((d) => d.id !== docId);
      }
    },
  };
}

function makeCollection(path: string) {
  const sortedDocs = (direction: "asc" | "desc") => {
    const list = collectionData(path);
    return [...list].sort((a, b) => (direction === "desc" ? b.order - a.order : a.order - b.order));
  };

  const getCollectionDocs = async () => {
    const prefix = `${path}/`;
    const docsFromStore = Object.entries(docStore)
      .filter(([docPath]) => {
        const remainder = docPath.slice(prefix.length);
        return docPath.startsWith(prefix) && !remainder.includes("/");
      })
      .map(([docPath, data]) => ({
        id: docPath.slice(prefix.length),
        ref: makeDoc(docPath),
        data: () => data,
      }));

    const legacyDocs = collectionData(path).map((item) => ({
      id: item.id || "legacy-id",
      ref: makeDoc(`${path}/${item.id}`),
      data: () => item,
    }));

    const mergedMap = new Map();
    for (const d of [...legacyDocs, ...docsFromStore]) {
      mergedMap.set(d.id, d);
    }
    const docs = Array.from(mergedMap.values());

    return { empty: docs.length === 0, docs };
  };

  return {
    doc: (id?: string) => makeDoc(`${path}/${id ?? "book-auto-id"}`),
    get: getCollectionDocs,
    where: (field: string, operator: string, value: unknown) => {
      const getFilteredDocs = () => {
        const prefix = `${path}/`;
        return Object.entries(docStore)
          .filter(([docPath, data]) => {
            const remainder = docPath.slice(prefix.length);
            if (!docPath.startsWith(prefix) || remainder.includes("/")) {
              return false;
            }
            const record = data as Record<string, unknown> | undefined;
            if (operator === "==") {
              return record?.[field] === value;
            }
            if (operator === "<") {
              return (
                typeof record?.[field] === "number" &&
                typeof value === "number" &&
                record[field] < value
              );
            }
            return false;
          })
          .map(([docPath, data]) => ({
            id: docPath.slice(prefix.length),
            order: ((data as Record<string, unknown> | undefined)?.order as number | undefined) ?? 0,
            data: () => data,
          }));
      };

      const chain = (
        docsList: Array<{ id: string; order: number; data: () => unknown }>,
      ) => ({
        orderBy: (_f: string, dir: "asc" | "desc" = "asc") => {
          const sorted = [...docsList].sort((a, b) =>
            dir === "desc" ? b.order - a.order : a.order - b.order,
          );
          return chain(sorted);
        },
        limit: (n: number) => {
          return chain(docsList.slice(0, n));
        },
        get: async () => {
          const docs = docsList.map((item) => ({
            id: item.id,
            ref: makeDoc(`${path}/${item.id}`),
            data: () => item.data(),
          }));
          return { empty: docs.length === 0, docs };
        },
      });

      return chain(getFilteredDocs());
    },
    orderBy: (_field: string, direction: "asc" | "desc" = "asc") => ({
      get: async () => {
        const docs = sortedDocs(direction).map((item) => ({
          id: item.id,
          ref: makeDoc(`${path}/${item.id}`),
          data: () => item,
        }));
        return { empty: docs.length === 0, docs };
      },
      limit: (n: number) => ({
        get: async () => {
          const docs = sortedDocs(direction)
            .slice(0, n)
            .map((item) => ({
              id: item.id,
              ref: makeDoc(`${path}/${item.id}`),
              data: () => item,
            }));
          return { empty: docs.length === 0, docs };
        },
      }),
    }),
    findNearest: (opts: {
      vectorField: string;
      queryVector: number[];
      distanceMeasure: string;
      limit: number;
    }) => ({
      get: async () => {
        const prefix = `${path}/`;
        const docs = Object.entries(docStore)
          .filter(([docPath]) => {
            const remainder = docPath.slice(prefix.length);
            return docPath.startsWith(prefix) && !remainder.includes("/");
          })
          .slice(0, opts.limit)
          .map(([docPath, data]) => ({
            id: docPath.slice(prefix.length),
            ref: makeDoc(docPath),
            data: () => data,
          }));
        return { empty: docs.length === 0, docs };
      },
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
    runTransaction: async <T>(
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
            messagesStore[parentPath] = [...(messagesStore[parentPath] ?? []), data as StoredDoc];
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
  listOwnedBooks,
  getMessages,
  getVisionDocument,
  resolveOpeningSuggestionAttempt,
  updateVisionDocument,
  upsertOpeningSuggestionMessage,
  getPreviousChapterLastScenes,
  getPriorChapterSummaries,
  retrieveRelevantFacts,
  getActiveChapter,
  deleteBook,
} from "./books.js";
import { DEFAULT_STYLE_PRESET_ID } from "./styles.js";

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
      styleRevision: 0,
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

describe("listOwnedBooks", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("returns only owned books newest first", async () => {
    docStore["books/book-old"] = {
      uid: "user-a",
      title: "Old book",
      style: { presetIds: ["warm"] },
      createdAt: { toMillis: () => 100 },
    };
    docStore["books/book-new"] = {
      uid: "user-a",
      title: "New book",
      style: { presetIds: ["sparse"] },
      createdAt: { toMillis: () => 200 },
    };
    docStore["books/book-other"] = {
      uid: "user-b",
      title: "Other writer",
      style: { presetIds: [] },
      createdAt: { toMillis: () => 300 },
    };

    const books = await listOwnedBooks("user-a");

    expect(books.map((book) => book.bookId)).toEqual(["book-new", "book-old"]);
    expect(books.map((book) => book.title)).toEqual(["New book", "Old book"]);
  });

  it("returns an empty list when the writer owns no books", async () => {
    expect(await listOwnedBooks("user-a")).toEqual([]);
  });

  it("normalizes a malformed legacy book without breaking the entire shelf", async () => {
    docStore["books/book-valid"] = {
      uid: "user-a",
      title: "Valid book",
      style: { presetIds: ["warm-character-driven"] },
      createdAt: { toMillis: () => 200 },
    };
    docStore["books/book-legacy"] = {
      uid: "user-a",
      createdAt: { toMillis: () => 100 },
    };

    const books = await listOwnedBooks("user-a");

    expect(books).toEqual([
      expect.objectContaining({ bookId: "book-valid", title: "Valid book" }),
      expect.objectContaining({
        bookId: "book-legacy",
        title: "Untitled Book",
        style: { presetIds: [DEFAULT_STYLE_PRESET_ID] },
      }),
    ]);
  });

  it("caps an overlong legacy style without failing the shelf response", async () => {
    docStore["books/book-legacy"] = {
      uid: "user-a",
      title: "Legacy book",
      style: {
        presetIds: ["warm-character-driven"],
        customInstruction: "x".repeat(1_001),
      },
      createdAt: { toMillis: () => 100 },
    };

    const books = await listOwnedBooks("user-a");

    expect(books[0]?.style.customInstruction).toHaveLength(1_000);
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

  it("returns undefined instead of throwing when the vision document does not exist", async () => {
    docStore = {};

    const vision = await updateVisionDocument("missing-book", {
      theme: "new",
      premise: "new premise",
      characterIntents: [],
      threads: [],
    });

    expect(vision).toBeUndefined();
    expect(updateCalls).toHaveLength(0);
  });

  it("preserves each thread's stored appearances instead of trusting the client-supplied value", async () => {
    docStore["books/book-1/vision/main"] = {
      theme: "old",
      premise: "old premise",
      characterIntents: [],
      structureMap: [],
      guidanceDial: "normal",
      threads: [
        {
          id: "thread-1",
          surface: "A locked door",
          meaning: "Trust broken",
          subtlety: "subtle",
          payoffIntent: "Reveal in Act 3",
          status: "open",
          appearances: ["scene-1", "scene-4"],
        },
      ],
    };

    const vision = await updateVisionDocument("book-1", {
      theme: "old",
      premise: "old premise",
      characterIntents: [],
      threads: [
        {
          id: "thread-1",
          surface: "A locked door",
          meaning: "Trust broken, edited",
          subtlety: "subtle",
          payoffIntent: "Reveal in Act 3",
          status: "open",
          appearances: ["client-forged-entry"],
        },
      ],
    });

    expect(vision?.threads).toEqual([
      expect.objectContaining({ id: "thread-1", appearances: ["scene-1", "scene-4"] }),
    ]);
  });

  it("gives a genuinely new thread id an empty appearances array regardless of client input", async () => {
    const vision = await updateVisionDocument("book-1", {
      theme: "old",
      premise: "old premise",
      characterIntents: [],
      threads: [
        {
          id: "brand-new-thread",
          surface: "A stranger",
          meaning: "Old debt",
          subtlety: "explicit",
          payoffIntent: "Confrontation",
          status: "open",
          appearances: ["client-forged-entry"],
        },
      ],
    });

    expect(vision?.threads).toEqual([
      expect.objectContaining({ id: "brand-new-thread", appearances: [] }),
    ]);
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

  it("projects only public message fields", async () => {
    messagesStore["books/book-1/messages"] = [
      {
        id: "message-1",
        order: 0,
        type: "assistant_scene",
        text: "Public prose.",
        sessionId: "session-1",
        assembledContext: { secret: true },
        prompt: "private prompt",
        createdAt: "private timestamp",
      },
    ];

    const messages = await getMessages("book-1");

    expect(messages[0]).toEqual({
      id: "message-1",
      order: 0,
      type: "assistant_scene",
      text: "Public prose.",
      sessionId: "session-1",
    });
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

    expect(message).toMatchObject({
      type: "assistant_scene",
      text: "A generated scene.",
      order: 2,
    });
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

  it("returns scenes from the highest-order chapter, ordered ascending", async () => {
    chaptersStore["books/book-1/chapters"] = [
      { id: "chapter-1", order: 0 },
      { id: "chapter-2", order: 1 },
    ];
    scenesStore["books/book-1/chapters/chapter-2/scenes"] = [
      { order: 1, text: "second scene", modelUsed: "gpt-5.6-sol", provider: "openai" },
      { order: 0, text: "first scene", modelUsed: "gpt-5.6-sol", provider: "openai" },
    ];

    const result = await getActiveChapterScenes("book-1");

    expect(result.chapterId).toBe("chapter-2");
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

describe("getActiveChapter", () => {
  beforeEach(() => {
    chaptersStore = {};
  });

  it("returns latest chapter id and order", async () => {
    chaptersStore["books/book-1/chapters"] = [
      { id: "chapter-1", order: 0 },
      { id: "chapter-2", order: 1 },
    ];
    const result = await getActiveChapter("book-1");
    expect(result).toEqual({ id: "chapter-2", order: 1 });
  });

  it("returns undefined if book has no chapters", async () => {
    const result = await getActiveChapter("book-without-chapters");
    expect(result).toBeUndefined();
  });
});

describe("getPreviousChapterLastScenes", () => {
  beforeEach(() => {
    docStore = {};
    scenesStore = {};
  });

  it("returns previous chapter's last scenes, sorted ascending", async () => {
    // Seed previous chapter
    docStore["books/book-1/chapters/chapter-0"] = { order: 0 };
    
    // Seed scenes
    scenesStore["books/book-1/chapters/chapter-0/scenes"] = [
      { order: 2, text: "third scene", modelUsed: "gemini", provider: "gemini" },
      { order: 1, text: "second scene", modelUsed: "gemini", provider: "gemini" },
      { order: 0, text: "first scene", modelUsed: "gemini", provider: "gemini" },
    ];

    const result = await getPreviousChapterLastScenes("book-1", 1, 2);

    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe("second scene");
    expect(result[1]?.text).toBe("third scene");
  });

  it("returns empty array if no previous chapter exists", async () => {
    const result = await getPreviousChapterLastScenes("book-1", 0, 2);
    expect(result).toEqual([]);
  });
});

describe("getPriorChapterSummaries", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("returns summaries of all prior chapters, ordered ascending", async () => {
    docStore["books/book-1/chapters/chapter-0"] = { order: 0, summary: "Summary of 1." };
    docStore["books/book-1/chapters/chapter-1"] = { order: 1, summary: "Summary of 2." };
    docStore["books/book-1/chapters/chapter-2"] = { order: 2 }; // No summary

    const result = await getPriorChapterSummaries("book-1", 2);

    expect(result).toEqual(["Summary of 1.", "Summary of 2."]);
  });
});

describe("retrieveRelevantFacts", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("returns matched facts via findNearest", async () => {
    docStore["books/book-1/facts/elena"] = { name: "Elena", description: "Elena is a rogue." };
    docStore["books/book-1/facts/crimson_inn"] = { name: "The Crimson Inn", description: "A cozy tavern." };

    const result = await retrieveRelevantFacts("book-1", [0.1, 0.2], 5);

    expect(result).toContain("Elena is a rogue.");
    expect(result).toContain("A cozy tavern.");
  });
});

describe("deleteBook", () => {
  beforeEach(() => {
    docStore = {};
  });

  it("successfully purges all book records and subcollections", async () => {
    docStore["books/book-1"] = { uid: "user-123", title: "My Novel" };
    docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
    docStore["books/book-1/chapters/chapter-1/scenes/scene-1"] = { text: "Scene text", order: 0 };
    docStore["books/book-1/messages/message-1"] = { text: "Hello" };
    docStore["books/book-1/vision/main"] = { theme: "Adventure" };
    docStore["books/book-1/facts/fact-1"] = { name: "Elena" };
    docStore["books/book-1/snapshots/snap-1"] = { name: "Backup" };
    docStore["books/book-1/snapshots/snap-1/chapters/chapter-1"] = { order: 0 };
    docStore["books/book-1/snapshots/snap-1/chapters/chapter-1/scenes/scene-1"] = { text: "Old scene" };

    await deleteBook("book-1", "user-123");

    // Assert everything was deleted
    expect(docStore["books/book-1"]).toBeUndefined();
    expect(docStore["books/book-1/chapters/chapter-1"]).toBeUndefined();
    expect(docStore["books/book-1/chapters/chapter-1/scenes/scene-1"]).toBeUndefined();
    expect(docStore["books/book-1/messages/message-1"]).toBeUndefined();
    expect(docStore["books/book-1/vision/main"]).toBeUndefined();
    expect(docStore["books/book-1/facts/fact-1"]).toBeUndefined();
    expect(docStore["books/book-1/snapshots/snap-1"]).toBeUndefined();
    expect(docStore["books/book-1/snapshots/snap-1/chapters/chapter-1"]).toBeUndefined();
    expect(docStore["books/book-1/snapshots/snap-1/chapters/chapter-1/scenes/scene-1"]).toBeUndefined();
  });

  it("throws error if book does not exist", async () => {
    await expect(deleteBook("non-existent-book", "user-123")).rejects.toThrow("Book not found.");
  });

  it("throws error if user is not the owner", async () => {
    docStore["books/book-1"] = { uid: "user-abc", title: "My Novel" };
    await expect(deleteBook("book-1", "wrong-user")).rejects.toThrow("Permission denied.");
  });
});

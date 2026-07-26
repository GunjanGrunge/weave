import { describe, it, expect, vi, beforeEach } from "vitest";

type SetCall = { path: string; data: unknown };

const { setCalls, commitMock, serverTimestampMock } = vi.hoisted(() => ({
  setCalls: [] as SetCall[],
  commitMock: vi.fn(),
  serverTimestampMock: vi.fn(() => "server-time"),
}));

let docStore: Record<string, unknown> = {};
let messagesStore: Record<string, Array<{ order: number }>> = {};

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
  };
}

function makeCollection(path: string) {
  return {
    doc: (id?: string) => makeDoc(`${path}/${id ?? "book-auto-id"}`),
    orderBy: (_field: string, direction: "asc" | "desc") => ({
      limit: (n: number) => ({
        get: async () => {
          const list = messagesStore[path] ?? [];
          const sorted = [...list].sort((a, b) =>
            direction === "desc" ? b.order - a.order : a.order - b.order,
          );
          const docs = sorted.slice(0, n).map((item) => ({ data: () => item }));
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
    batch: () => ({
      set: (ref: { path: string }, data: unknown) => setCalls.push({ path: ref.path, data }),
      commit: commitMock,
    }),
  })),
}));

import {
  createBookWithIntake,
  getBook,
  getVisionDocument,
  appendStructuralNoteMessage,
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

describe("appendStructuralNoteMessage", () => {
  beforeEach(() => {
    setCalls.length = 0;
    messagesStore = {};
  });

  it("writes a structural_note message at order 0 when no messages exist yet", async () => {
    await appendStructuralNoteMessage("book-1", "2-3 opening suggestions");

    const write = setCalls.find((call) => call.path.startsWith("books/book-1/messages/"));
    expect(write?.data).toMatchObject({
      type: "structural_note",
      text: "2-3 opening suggestions",
      order: 0,
    });
  });

  it("writes at order = previous max + 1 when messages already exist", async () => {
    messagesStore["books/book-1/messages"] = [{ order: 0 }, { order: 1 }, { order: 7 }];

    await appendStructuralNoteMessage("book-1", "The Muse suggests...");

    const write = setCalls.find((call) => call.path.startsWith("books/book-1/messages/"));
    expect(write?.data).toMatchObject({ order: 8, type: "structural_note" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

type SetCall = { path: string; data: unknown };

const { setCalls, commitMock, serverTimestampMock } = vi.hoisted(() => ({
  setCalls: [] as SetCall[],
  commitMock: vi.fn(),
  serverTimestampMock: vi.fn(() => "server-time"),
}));

function makeDoc(path: string) {
  return {
    id: path.split("/").at(-1),
    path,
    collection: (name: string) => ({
      doc: (id?: string) => makeDoc(`${path}/${name}/${id ?? `${name}-auto-id`}`),
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
    collection: (name: string) => ({
      doc: () => makeDoc(`${name}/book-auto-id`),
    }),
    batch: () => ({
      set: (ref: { path: string }, data: unknown) => setCalls.push({ path: ref.path, data }),
      commit: commitMock,
    }),
  })),
}));

import { createBookWithIntake } from "./books.js";
import { DEFAULT_STYLE_PRESET_ID } from "../config/stylePresets.js";

describe("createBookWithIntake", () => {
  beforeEach(() => {
    setCalls.length = 0;
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

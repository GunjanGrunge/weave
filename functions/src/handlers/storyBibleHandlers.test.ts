import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBookMock,
  listStoryBibleCharactersMock,
  getCanonicalRosterMock,
  requestStoryBibleRebuildMock,
  updateStoryBibleCharacterMock,
  verifyIdTokenMock,
} = vi.hoisted(() => ({
  getBookMock: vi.fn(),
  listStoryBibleCharactersMock: vi.fn(),
  getCanonicalRosterMock: vi.fn(),
  requestStoryBibleRebuildMock: vi.fn(),
  updateStoryBibleCharacterMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
}));

vi.mock("../services/storyBible.js", async () => {
  const actual = await vi.importActual<typeof import("../services/storyBible.js")>(
    "../services/storyBible.js",
  );
  return {
    ...actual,
    listStoryBibleCharacters: listStoryBibleCharactersMock,
    getCanonicalRoster: getCanonicalRosterMock,
    requestStoryBibleRebuild: requestStoryBibleRebuildMock,
    updateStoryBibleCharacter: updateStoryBibleCharacterMock,
  };
});

import { buildGetStoryBibleResponse } from "./getStoryBible.js";
import { buildRebuildStoryBibleResponse } from "./rebuildStoryBible.js";
import { buildUpdateStoryBibleCharacterResponse } from "./updateStoryBibleCharacter.js";

describe("Story Bible handlers", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset().mockResolvedValue({ uid: "owner-1" });
    getBookMock.mockReset().mockResolvedValue({
      uid: "owner-1",
      title: "A mystery",
      storyBibleState: "current",
    });
    listStoryBibleCharactersMock.mockReset().mockResolvedValue([]);
    getCanonicalRosterMock.mockReset().mockResolvedValue({
      text: "",
      state: "current",
      characterCount: 0,
      revision: 0,
    });
    requestStoryBibleRebuildMock.mockReset().mockResolvedValue({ sceneCount: 2 });
    updateStoryBibleCharacterMock.mockReset();
  });

  it("returns only the owned book's character profiles", async () => {
    listStoryBibleCharactersMock.mockResolvedValue([{ id: "elena", name: "Elena", version: 1 }]);

    const result = await buildGetStoryBibleResponse("Bearer valid", { bookId: "book-1" });

    expect(result).toMatchObject({
      statusCode: 200,
      body: {
        book: { bookId: "book-1", title: "A mystery" },
        memoryState: "current",
        characters: [{ id: "elena", name: "Elena" }],
      },
    });
    expect(listStoryBibleCharactersMock).toHaveBeenCalledWith("book-1");
  });

  it("reports manuscript books without profiles as rebuild-required", async () => {
    getCanonicalRosterMock.mockResolvedValue({
      text: "",
      state: "rebuild-required",
      characterCount: 0,
      revision: 1,
    });

    const result = await buildGetStoryBibleResponse("Bearer valid", { bookId: "book-1" });

    expect(result).toMatchObject({
      statusCode: 200,
      body: { memoryState: "rebuild-required", characters: [] },
    });
  });

  it("checks ownership before returning or updating Story Bible data", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "intruder" });

    const read = await buildGetStoryBibleResponse("Bearer valid", { bookId: "book-1" });
    const update = await buildUpdateStoryBibleCharacterResponse("Bearer valid", {
      bookId: "book-1",
      characterId: "elena",
      expectedVersion: 1,
      character: { name: "Elena" },
    });

    expect(read.statusCode).toBe(401);
    expect(update.statusCode).toBe(401);
    expect(listStoryBibleCharactersMock).not.toHaveBeenCalled();
    expect(updateStoryBibleCharacterMock).not.toHaveBeenCalled();
  });

  it("applies a versioned author correction and lock patch", async () => {
    updateStoryBibleCharacterMock.mockResolvedValue({
      id: "mr-bell",
      name: "Mr. Bell",
      stableTraits: { age: "72" },
      lockedFields: ["stableTraits.age"],
      version: 3,
    });

    const result = await buildUpdateStoryBibleCharacterResponse("Bearer valid", {
      bookId: "book-1",
      characterId: "mr-bell",
      expectedVersion: 2,
      character: {
        name: "Mr. Bell",
        aliases: ["Bell"],
        summary: "An elderly witness.",
        stableTraits: { age: "72" },
        currentState: { occupation: "retired teacher" },
        lockedFields: ["stableTraits.age"],
        archived: false,
      },
    });

    expect(result.statusCode).toBe(200);
    expect(updateStoryBibleCharacterMock).toHaveBeenCalledWith(
      "book-1",
      "mr-bell",
      2,
      expect.objectContaining({
        stableTraits: { age: "72" },
        lockedFields: ["stableTraits.age"],
      }),
    );
  });

  it("returns 409 instead of overwriting a newer profile version", async () => {
    updateStoryBibleCharacterMock.mockRejectedValue(
      Object.assign(new Error("Character changed."), { code: "version-conflict" }),
    );

    const result = await buildUpdateStoryBibleCharacterResponse("Bearer valid", {
      bookId: "book-1",
      characterId: "mr-bell",
      expectedVersion: 1,
      character: {
        name: "Mr. Bell",
        aliases: [],
        summary: "",
        stableTraits: {},
        currentState: {},
        lockedFields: [],
        archived: false,
      },
    });

    expect(result.statusCode).toBe(409);
  });

  it("rejects oversized corrections instead of silently truncating them", async () => {
    const result = await buildUpdateStoryBibleCharacterResponse("Bearer valid", {
      bookId: "book-1",
      characterId: "mr-bell",
      expectedVersion: 1,
      character: {
        name: "x".repeat(161),
        aliases: [],
        summary: "",
        stableTraits: {},
        currentState: {},
        lockedFields: [],
        archived: false,
      },
    });

    expect(result).toEqual({
      statusCode: 400,
      body: {
        code: "invalid-argument",
        message: "name exceeds the 160 character limit.",
      },
    });
    expect(updateStoryBibleCharacterMock).not.toHaveBeenCalled();
  });

  it("starts an owned book rebuild without accepting manuscript text from the client", async () => {
    const result = await buildRebuildStoryBibleResponse("Bearer valid", {
      bookId: "book-1",
    });

    expect(result).toEqual({
      statusCode: 202,
      body: { status: "started", sceneCount: 2 },
    });
    expect(requestStoryBibleRebuildMock).toHaveBeenCalledWith("book-1");
  });
});

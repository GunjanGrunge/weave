import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, readBookManuscriptMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  readBookManuscriptMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/snapshots.js", () => ({
  readBookManuscript: readBookManuscriptMock,
  SnapshotError: class SnapshotError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { AuthError } from "../services/auth.js";
import { SnapshotError } from "../services/snapshots.js";
import { buildGetManuscriptResponse } from "./getManuscript.js";

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

describe("buildGetManuscriptResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    readBookManuscriptMock.mockReset();
  });

  it("returns the owned manuscript", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
    readBookManuscriptMock.mockResolvedValue(manuscript);

    const result = await buildGetManuscriptResponse("Bearer token", { bookId: "book-1" });

    expect(result).toEqual({ statusCode: 200, body: { manuscript } });
    expect(readBookManuscriptMock).toHaveBeenCalledWith("book-1", "user-1");
  });

  it("authenticates before validating the request body", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildGetManuscriptResponse(undefined, {});

    expect(result.statusCode).toBe(401);
    expect(readBookManuscriptMock).not.toHaveBeenCalled();
  });

  it("rejects a missing book id", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });

    const result = await buildGetManuscriptResponse("Bearer token", {});

    expect(result.statusCode).toBe(400);
    expect(readBookManuscriptMock).not.toHaveBeenCalled();
  });

  it("maps missing books to 404", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
    readBookManuscriptMock.mockRejectedValue(new SnapshotError("not-found", "Book not found."));

    const result = await buildGetManuscriptResponse("Bearer token", {
      bookId: "missing",
    });

    expect(result.statusCode).toBe(404);
  });

  it("does not expose another writer's book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-2" });
    readBookManuscriptMock.mockRejectedValue(
      new SnapshotError("permission-denied", "Permission denied."),
    );

    const result = await buildGetManuscriptResponse("Bearer token", {
      bookId: "book-1",
    });

    expect(result.statusCode).toBe(401);
  });
});

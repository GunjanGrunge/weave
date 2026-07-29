import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, getBookMock, createNextChapterMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  createNextChapterMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", async () => {
  const actual = await vi.importActual<typeof import("../services/books.js")>(
    "../services/books.js",
  );
  return {
    ...actual,
    getBook: getBookMock,
    createNextChapter: createNextChapterMock,
  };
});

import { buildCreateChapterResponse } from "./createChapter.js";
import { AuthError } from "../services/auth.js";
import { NoChaptersError } from "../services/books.js";

describe("buildCreateChapterResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    createNextChapterMock.mockReset();
  });

  it("returns 200 {chapterId, order} for a valid owned book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", title: "My Book" });
    createNextChapterMock.mockResolvedValue({
      chapterId: "chapter-2",
      order: 1,
      prevChapterId: "chapter-1",
    });

    const result = await buildCreateChapterResponse("Bearer valid", {
      bookId: "book-1",
      idempotencyKey: "request-1",
    });

    expect(result).toEqual({
      statusCode: 200,
      body: { chapterId: "chapter-2", order: 1 },
    });
    expect(createNextChapterMock).toHaveBeenCalledWith("book-1", "request-1");
  });

  it("returns 401 when auth token is missing or invalid", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or invalid token."),
    );

    const result = await buildCreateChapterResponse(undefined, {
      bookId: "book-1",
      idempotencyKey: "request-1",
    });

    expect(result.statusCode).toBe(401);
    expect((result.body as { code: string }).code).toBe("unauthenticated");
    expect(createNextChapterMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the book does not exist", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildCreateChapterResponse("Bearer valid", {
      bookId: "nonexistent",
      idempotencyKey: "request-1",
    });

    expect(result.statusCode).toBe(404);
    expect(createNextChapterMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the book is owned by a different user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-b", title: "Their Book" });

    const result = await buildCreateChapterResponse("Bearer valid", {
      bookId: "book-2",
      idempotencyKey: "request-1",
    });

    expect(result.statusCode).toBe(401);
    expect((result.body as { code: string }).code).toBe("permission-denied");
    expect(createNextChapterMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the book has no chapters", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", title: "Empty Book" });
    createNextChapterMock.mockRejectedValue(new NoChaptersError());

    const result = await buildCreateChapterResponse("Bearer valid", {
      bookId: "book-empty",
      idempotencyKey: "request-1",
    });

    expect(result.statusCode).toBe(409);
    expect((result.body as { code: string }).code).toBe("failed-precondition");
  });

  it("returns 400 when bookId is missing from the body", async () => {
    const result = await buildCreateChapterResponse("Bearer valid", {});

    expect(result.statusCode).toBe(400);
    expect((result.body as { code: string }).code).toBe("invalid-argument");
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not an object", async () => {
    const result = await buildCreateChapterResponse("Bearer valid", null);

    expect(result.statusCode).toBe(400);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});

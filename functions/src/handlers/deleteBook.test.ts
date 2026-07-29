import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, deleteBookMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  deleteBookMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  deleteBook: deleteBookMock,
}));

import { buildDeleteBookResponse } from "./deleteBook.js";

describe("buildDeleteBookResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    deleteBookMock.mockReset();
  });

  it("returns 200 {status: 'ok'} on successful delete", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123" });
    deleteBookMock.mockResolvedValue(undefined);

    const result = await buildDeleteBookResponse("Bearer token", { bookId: "book-1" });

    expect(result).toEqual({
      statusCode: 200,
      body: { status: "ok" },
    });
    expect(deleteBookMock).toHaveBeenCalledWith("book-1", "user-123");
  });

  it("returns 400 when bookId is missing", async () => {
    const result = await buildDeleteBookResponse("Bearer token", {});
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 when book is not found", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123" });
    deleteBookMock.mockRejectedValue(new Error("Book not found."));

    const result = await buildDeleteBookResponse("Bearer token", { bookId: "book-1" });
    expect(result.statusCode).toBe(404);
  });

  it("returns 401 when permission is denied", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123" });
    deleteBookMock.mockRejectedValue(new Error("Permission denied."));

    const result = await buildDeleteBookResponse("Bearer token", { bookId: "book-1" });
    expect(result.statusCode).toBe(401);
  });
});

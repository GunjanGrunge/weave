import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, getBookMock, getMessagesMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  getMessagesMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  getMessages: getMessagesMock,
}));

import { buildGetMessagesResponse } from "./getMessages.js";
import { AuthError } from "../services/auth.js";

const book = { uid: "user-a", title: "A heist", style: { presetIds: ["warm"] } };
const messages = [
  { type: "system" as const, text: "What do you want to write?", order: 0, createdAt: "t0" },
  { type: "user" as const, text: "A heist", order: 1, createdAt: "t1" },
];

describe("buildGetMessagesResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    getMessagesMock.mockReset();
  });

  it("returns the owned book's messages", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    getMessagesMock.mockResolvedValue(messages);

    const result = await buildGetMessagesResponse("Bearer valid", { bookId: "book-1" });

    expect(result).toEqual({ statusCode: 200, body: { messages } });
  });

  it("returns 400 when bookId is missing", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGetMessagesResponse("Bearer valid", {});

    expect(result.statusCode).toBe(400);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildGetMessagesResponse(undefined, { bookId: "book-1" });

    expect(result.statusCode).toBe(401);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildGetMessagesResponse("Bearer valid", { bookId: "missing-book" });

    expect(result.statusCode).toBe(404);
    expect(getMessagesMock).not.toHaveBeenCalled();
  });

  it("rejects a book owned by another user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue(book);

    const result = await buildGetMessagesResponse("Bearer valid", { bookId: "book-1" });

    expect(result.statusCode).toBe(401);
    expect(getMessagesMock).not.toHaveBeenCalled();
  });
});

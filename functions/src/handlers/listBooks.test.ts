import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, listOwnedBooksMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  listOwnedBooksMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  listOwnedBooks: listOwnedBooksMock,
}));

import { AuthError } from "../services/auth.js";
import { buildListBooksResponse } from "./listBooks.js";

describe("buildListBooksResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    listOwnedBooksMock.mockReset();
  });

  it("returns only the signed-in writer's books", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    listOwnedBooksMock.mockResolvedValue([
      {
        bookId: "book-1",
        title: "A heist",
        style: { presetIds: ["warm"] },
        createdAt: { toDate: () => new Date("2026-07-27T12:00:00.000Z") },
      },
    ]);

    const result = await buildListBooksResponse("Bearer valid");

    expect(listOwnedBooksMock).toHaveBeenCalledWith("user-a");
    expect(result).toEqual({
      statusCode: 200,
      body: {
        books: [
          {
            bookId: "book-1",
            title: "A heist",
            style: { presetIds: ["warm"] },
            createdAt: "2026-07-27T12:00:00.000Z",
          },
        ],
      },
    });
  });

  it("returns an empty list for a writer with no books", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    listOwnedBooksMock.mockResolvedValue([]);

    const result = await buildListBooksResponse("Bearer valid");

    expect(result).toEqual({ statusCode: 200, body: { books: [] } });
  });

  it("rejects an unauthenticated request before querying books", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildListBooksResponse(undefined);

    expect(result.statusCode).toBe(401);
    expect(listOwnedBooksMock).not.toHaveBeenCalled();
  });
});

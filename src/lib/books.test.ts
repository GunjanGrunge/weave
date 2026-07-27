import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
}));

vi.mock("./api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import { booksQueryKey, fetchBooks, formatBookDate } from "./books";

describe("fetchBooks", () => {
  beforeEach(() => authenticatedFetchMock.mockReset());

  it("returns validated owned book summaries", async () => {
    const books = [
      {
        bookId: "book-1",
        title: "A heist",
        style: { presetIds: ["warm"] },
        createdAt: "2026-07-27T12:00:00.000Z",
      },
    ];
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ books }), { status: 200 }),
    );

    await expect(fetchBooks()).resolves.toEqual(books);
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/listBooks");
  });

  it("rejects a malformed response instead of rendering fabricated data", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ books: [{ title: "Missing ID" }] }), { status: 200 }),
    );

    await expect(fetchBooks()).rejects.toThrow(/invalid/i);
  });

  it("rejects a non-success response", async () => {
    authenticatedFetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchBooks()).rejects.toThrow(/load/i);
  });
});

describe("formatBookDate", () => {
  it("falls back cleanly when no timestamp is available", () => {
    expect(formatBookDate(null)).toBe("Recently created");
  });
});

describe("booksQueryKey", () => {
  it("isolates cached shelves by Firebase uid", () => {
    expect(booksQueryKey("user-a")).not.toEqual(booksQueryKey("user-b"));
  });
});

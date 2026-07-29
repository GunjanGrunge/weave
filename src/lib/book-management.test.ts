import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
}));

vi.mock("./api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import {
  compareSnapshot,
  deleteBook,
  exportBook,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
} from "./book-management";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("book management API", () => {
  beforeEach(() => authenticatedFetchMock.mockReset());

  it("uses the existing snapshot API contracts", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ snapshotId: "snapshot-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          snapshots: [{ id: "snapshot-1", name: "Draft one", createdAt: null }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          chapters: [
            {
              chapterId: "chapter-1",
              title: "Chapter 1",
              status: "changed",
              scenes: [],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await expect(saveSnapshot("book-1", "Draft one")).resolves.toBe("snapshot-1");
    await expect(listSnapshots("book-1")).resolves.toHaveLength(1);
    await expect(compareSnapshot("book-1", "snapshot-1")).resolves.toHaveLength(1);
    await restoreSnapshot("book-1", "snapshot-1");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      4,
      "/restoreSnapshot",
      expect.objectContaining({
        body: JSON.stringify({
          bookId: "book-1",
          snapshotId: "snapshot-1",
          confirmed: true,
        }),
      }),
    );
  });

  it("requests an export and sends the required deletion confirmation", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ downloadUrl: "https://example.com/book.md" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    await expect(exportBook("book-1", "markdown")).resolves.toBe("https://example.com/book.md");
    await deleteBook("book-1");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      1,
      "/exportBook",
      expect.objectContaining({
        body: JSON.stringify({ bookId: "book-1", format: "markdown" }),
      }),
    );
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      2,
      "/deleteBook",
      expect.objectContaining({
        body: JSON.stringify({ bookId: "book-1", confirmation: "DELETE" }),
      }),
    );
  });

  it("surfaces an API error message", async () => {
    authenticatedFetchMock.mockResolvedValue(
      jsonResponse({ message: "Snapshot is still being created." }, 409),
    );

    await expect(listSnapshots("book-1")).rejects.toThrow("Snapshot is still being created.");
  });
});

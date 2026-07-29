import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  verifyIdTokenMock,
  createBookSnapshotMock,
  listBookSnapshotsMock,
  compareBookSnapshotMock,
  restoreBookSnapshotMock,
  exportBookManuscriptMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  createBookSnapshotMock: vi.fn(),
  listBookSnapshotsMock: vi.fn(),
  compareBookSnapshotMock: vi.fn(),
  restoreBookSnapshotMock: vi.fn(),
  exportBookManuscriptMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/snapshots.js", () => ({
  createBookSnapshot: createBookSnapshotMock,
  listBookSnapshots: listBookSnapshotsMock,
  compareBookSnapshot: compareBookSnapshotMock,
  restoreBookSnapshot: restoreBookSnapshotMock,
  exportBookManuscript: exportBookManuscriptMock,
  SnapshotError: class SnapshotError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { buildSaveSnapshotResponse } from "./saveSnapshot.js";
import { buildListSnapshotsResponse } from "./listSnapshots.js";
import { buildCompareSnapshotResponse } from "./compareSnapshot.js";
import { buildRestoreSnapshotResponse } from "./restoreSnapshot.js";
import { buildExportBookResponse } from "./exportBook.js";

describe("Snapshot & Export HTTP Handlers", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    createBookSnapshotMock.mockReset();
    listBookSnapshotsMock.mockReset();
    compareBookSnapshotMock.mockReset();
    restoreBookSnapshotMock.mockReset();
    exportBookManuscriptMock.mockReset();
  });

  describe("saveSnapshot", () => {
    it("returns 200 and snapshotId on success", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      createBookSnapshotMock.mockResolvedValue("snap-abc");

      const result = await buildSaveSnapshotResponse("Bearer token", {
        bookId: "book-1",
        name: "My Backup",
      });

      expect(result).toEqual({
        statusCode: 200,
        body: { snapshotId: "snap-abc" },
      });
      expect(createBookSnapshotMock).toHaveBeenCalledWith("book-1", "My Backup", "user-1");
    });

    it("returns 400 when parameters are missing", async () => {
      const result = await buildSaveSnapshotResponse("Bearer token", { bookId: "book-1" });
      expect(result.statusCode).toBe(400);
    });
  });

  describe("listSnapshots", () => {
    it("returns 200 and list of snapshots", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      listBookSnapshotsMock.mockResolvedValue([
        { id: "snap-1", name: "Backup 1", createdAt: "2026-07-29T12:00:00Z" },
      ]);

      const result = await buildListSnapshotsResponse("Bearer token", { bookId: "book-1" });

      expect(result).toEqual({
        statusCode: 200,
        body: {
          snapshots: [
            { id: "snap-1", name: "Backup 1", createdAt: "2026-07-29T12:00:00.000Z" },
          ],
        },
      });
    });
  });

  describe("compareSnapshot", () => {
    it("returns 200 and difference comparison object", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      compareBookSnapshotMock.mockResolvedValue([
        {
          chapterId: "chapter-1",
          title: "Chapter 1",
          status: "changed",
          scenes: [{ sceneId: "scene-1", status: "added" }],
        },
      ]);

      const result = await buildCompareSnapshotResponse("Bearer token", {
        bookId: "book-1",
        snapshotId: "snap-123",
      });

      expect(result).toEqual({
        statusCode: 200,
        body: {
          chapters: [
            {
              chapterId: "chapter-1",
              title: "Chapter 1",
              status: "changed",
              scenes: [{ sceneId: "scene-1", status: "added" }],
            },
          ],
        },
      });
    });
  });

  describe("restoreSnapshot", () => {
    it("returns 200 status ok on success", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      restoreBookSnapshotMock.mockResolvedValue(undefined);

      const result = await buildRestoreSnapshotResponse("Bearer token", {
        bookId: "book-1",
        snapshotId: "snap-123",
        confirmed: true,
      });

      expect(result).toEqual({
        statusCode: 200,
        body: { status: "ok" },
      });
      expect(restoreBookSnapshotMock).toHaveBeenCalledWith("book-1", "snap-123", true, "user-1");
    });

    it("does not treat a truthy string as destructive confirmation", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      restoreBookSnapshotMock.mockResolvedValue(undefined);

      await buildRestoreSnapshotResponse("Bearer token", {
        bookId: "book-1",
        snapshotId: "snap-123",
        confirmed: "false",
      });

      expect(restoreBookSnapshotMock).toHaveBeenCalledWith(
        "book-1",
        "snap-123",
        false,
        "user-1",
      );
    });
  });

  describe("exportBook", () => {
    it("returns 200 and downloadUrl on success", async () => {
      verifyIdTokenMock.mockResolvedValue({ uid: "user-1" });
      exportBookManuscriptMock.mockResolvedValue("http://storage/download-link");

      const result = await buildExportBookResponse("Bearer token", {
        bookId: "book-1",
        format: "markdown",
      });

      expect(result).toEqual({
        statusCode: 200,
        body: { downloadUrl: "http://storage/download-link" },
      });
      expect(exportBookManuscriptMock).toHaveBeenCalledWith("book-1", "markdown", "user-1");
    });
  });
});

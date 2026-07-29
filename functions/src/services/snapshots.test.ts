import { describe, it, expect, vi, beforeEach } from "vitest";

const { getBookMock } = vi.hoisted(() => ({
  getBookMock: vi.fn(),
}));

vi.mock("./books.js", () => ({
  getBook: getBookMock,
}));

const saveMock = vi.fn();
const getSignedUrlMock = vi.fn();
const publicUrlMock = vi.fn();

vi.mock("firebase-admin/storage", () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      file: vi.fn((_path: string) => ({
        save: saveMock,
        getSignedUrl: getSignedUrlMock,
        publicUrl: publicUrlMock,
      })),
    })),
  })),
}));

let docStore: Record<string, unknown> = {};
let deletedPaths: string[] = [];
let updateCalls: Record<string, unknown> = {};

interface MockDocRef {
  id: string;
  path: string;
  get: () => Promise<{ exists: boolean; data: () => unknown }>;
  set: (data: unknown) => Promise<void>;
  delete: () => Promise<void>;
  update: (data: Record<string, unknown>) => Promise<void>;
  collection: (colName: string) => MockCollectionRef;
}

interface MockCollectionRef {
  path: string;
  doc: (docId?: string) => MockDocRef;
  get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
  orderBy: () => {
    get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
    limit: () => {
      get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
    };
  };
  where: () => {
    orderBy: () => {
      get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
    };
    get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
    limit: () => {
      get: () => Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => unknown }> }>;
    };
  };
}

function makeDocRef(path: string): MockDocRef {
  const parts = path.split("/");
  const docId = parts[parts.length - 1]!;
  return {
    id: docId,
    path,
    get: vi.fn(async () => ({
      exists: docStore[path] !== undefined,
      data: () => docStore[path],
    })),
    set: vi.fn(async (data: unknown) => {
      docStore[path] = data;
    }),
    delete: vi.fn(async () => {
      delete docStore[path];
      deletedPaths.push(path);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      updateCalls[path] = data;
      if (docStore[path]) {
        docStore[path] = { ...(docStore[path] as Record<string, unknown>), ...data };
      }
    }),
    collection: vi.fn((colName: string) => makeCollectionRef(`${path}/${colName}`)),
  };
}

function makeCollectionRef(path: string): MockCollectionRef {
  const getDocsMock = async () => {
    const matching = Object.entries(docStore).filter(
      ([docPath]) =>
        docPath.startsWith(path) && docPath.split("/").length === path.split("/").length + 1,
    );
    return {
      docs: matching.map(([docPath, data]) => ({
        id: docPath.split("/").pop()!,
        ref: makeDocRef(docPath),
        data: () => data,
      })),
    };
  };

  return {
    path,
    doc: vi.fn((docId?: string) => {
      const actualDocId = docId || "mock-generated-id";
      return makeDocRef(`${path}/${actualDocId}`);
    }),
    get: getDocsMock,
    orderBy: vi.fn(() => ({
      get: getDocsMock,
      limit: vi.fn(() => ({
        get: getDocsMock,
      })),
    })),
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        get: getDocsMock,
      })),
      get: getDocsMock,
      limit: vi.fn(() => ({
        get: getDocsMock,
      })),
    })),
  };
}

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-timestamp"),
  },
  getFirestore: vi.fn(() => ({
    collection: (cName: string) => makeCollectionRef(cName),
    batch: vi.fn(() => {
      const operations: Array<() => void> = [];
      return {
        set: vi.fn((ref: { path: string }, data: unknown) => {
          operations.push(() => {
            docStore[ref.path] = data;
          });
        }),
        delete: vi.fn((ref: { path: string }) => {
          operations.push(() => {
            delete docStore[ref.path];
            deletedPaths.push(ref.path);
          });
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          operations.push(() => {
            updateCalls[ref.path] = data;
            docStore[ref.path] = {
              ...(docStore[ref.path] as Record<string, unknown> | undefined),
              ...data,
            };
          });
        }),
        commit: vi.fn(async () => {
          operations.forEach((operation) => operation());
        }),
      };
    }),
    runTransaction: vi.fn(async (fn) => {
      const transaction = {
        get: vi.fn(async (ref: { path: string }) => ({
          exists: docStore[ref.path] !== undefined,
          data: () => docStore[ref.path],
        })),
        set: vi.fn((ref: { path: string }, data: unknown) => {
          docStore[ref.path] = data;
        }),
        delete: vi.fn((ref: { path: string }) => {
          delete docStore[ref.path];
          deletedPaths.push(ref.path);
        }),
        update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
          updateCalls[ref.path] = data;
          if (docStore[ref.path]) {
            docStore[ref.path] = {
              ...(docStore[ref.path] as Record<string, unknown>),
              ...data,
            };
          }
        }),
      };
      return fn(transaction);
    }),
  })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

import {
  createBookSnapshot,
  listBookSnapshots,
  compareBookSnapshot,
  restoreBookSnapshot,
  exportBookManuscript,
  readBookManuscript,
} from "./snapshots.js";

describe("Snapshots Service", () => {
  beforeEach(() => {
    docStore = {
      "books/book-1": { uid: "user-123", manuscriptRevision: 1 },
    };
    deletedPaths = [];
    updateCalls = {};

    saveMock.mockReset();
    getSignedUrlMock.mockReset();
    publicUrlMock.mockReset();
    getBookMock.mockReset();

    getBookMock.mockResolvedValue({
      uid: "user-123",
      title: "Elena's Legacy",
      manuscriptRevision: 1,
    });
  });

  describe("createBookSnapshot", () => {
    it("successfully copies Vision, Chapters, and Scenes", async () => {
      docStore["books/book-1/vision/main"] = { theme: "Adventure" };
      docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
      docStore["books/book-1/chapters/chapter-1/scenes/scene-1"] = {
        text: "Scene text.",
        order: 0,
      };

      const snapshotId = await createBookSnapshot("book-1", "My Backup", "user-123");

      expect(snapshotId).toBe("mock-generated-id");

      const snapBase = `books/book-1/snapshots/${snapshotId}`;
      expect(docStore[`${snapBase}/vision/main`]).toEqual({ theme: "Adventure" });
      expect(docStore[`${snapBase}/chapters/chapter-1`]).toEqual({ order: 0 });
      expect(docStore[`${snapBase}/chapters/chapter-1/scenes/scene-1`]).toEqual({
        text: "Scene text.",
        order: 0,
      });
    });

    it("throws permission-denied when user does not own the book", async () => {
      await expect(createBookSnapshot("book-1", "Backup", "wrong-user")).rejects.toThrow(
        "Permission denied.",
      );
    });

    it("does not publish a snapshot when the manuscript revision changes during capture", async () => {
      getBookMock
        .mockResolvedValueOnce({ uid: "user-123", manuscriptRevision: 1 })
        .mockResolvedValueOnce({ uid: "user-123", manuscriptRevision: 1 });
      docStore["books/book-1"] = { uid: "user-123", manuscriptRevision: 2 };

      await expect(createBookSnapshot("book-1", "Raced Backup", "user-123")).rejects.toThrow(
        "The manuscript changed while the snapshot was being prepared.",
      );
      expect(docStore["books/book-1/snapshots/mock-generated-id"]).toBeUndefined();
    });
  });

  describe("readBookManuscript", () => {
    it("returns accepted scenes grouped into ordered chapters with manuscript totals", async () => {
      docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
      docStore["books/book-1/chapters/chapter-1/scenes/scene-1"] = {
        text: "The road began.",
        order: 0,
      };
      docStore["books/book-1/chapters/chapter-2"] = { order: 1 };
      docStore["books/book-1/chapters/chapter-2/scenes/scene-2"] = {
        text: "It ended at dawn.",
        order: 0,
      };

      const result = await readBookManuscript("book-1", "user-123");

      expect(result).toEqual({
        bookId: "book-1",
        title: "Elena's Legacy",
        chapters: [
          {
            chapterId: "chapter-1",
            order: 0,
            title: "Chapter 1",
            scenes: [{ sceneId: "scene-1", order: 0, text: "The road began." }],
          },
          {
            chapterId: "chapter-2",
            order: 1,
            title: "Chapter 2",
            scenes: [{ sceneId: "scene-2", order: 0, text: "It ended at dawn." }],
          },
        ],
        sceneCount: 2,
        wordCount: 7,
      });
    });

    it("rejects access to another writer's manuscript before reading chapters", async () => {
      await expect(readBookManuscript("book-1", "user-999")).rejects.toMatchObject({
        code: "permission-denied",
      });
    });
  });

  describe("listBookSnapshots", () => {
    it("lists metadata of saved snapshots", async () => {
      docStore["books/book-1/snapshots/snap-1"] = {
        name: "First",
        createdAt: "2026-07-29T12:00:00Z",
      };
      docStore["books/book-1/snapshots/snap-building"] = {
        name: "Incomplete",
        state: "creating",
      };

      const list = await listBookSnapshots("book-1", "user-123");

      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        id: "snap-1",
        name: "First",
        createdAt: "2026-07-29T12:00:00Z",
      });
    });
  });

  describe("compareBookSnapshot", () => {
    it("identifies added, removed, changed, and unchanged chapters/scenes", async () => {
      // Live state
      docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
      docStore["books/book-1/chapters/chapter-1/scenes/scene-1"] = {
        text: "Old scene text.",
        order: 0,
      };
      docStore["books/book-1/chapters/chapter-1/scenes/scene-2"] = {
        text: "Newly added scene.",
        order: 1,
      };
      docStore["books/book-1/chapters/chapter-2"] = { order: 1 }; // Added chapter

      // Snapshot state
      const snapBase = "books/book-1/snapshots/snap-123";
      docStore[`${snapBase}`] = { name: "Backup" };
      docStore[`${snapBase}/chapters/chapter-1`] = { order: 0 };
      docStore[`${snapBase}/chapters/chapter-1/scenes/scene-1`] = {
        text: "Old scene text.",
        order: 0,
      };
      docStore[`${snapBase}/chapters/chapter-1/scenes/scene-3`] = {
        text: "Removed scene.",
        order: 1,
      };

      const diffs = await compareBookSnapshot("book-1", "snap-123", "user-123");

      expect(diffs).toHaveLength(2);

      // Chapter 1 is changed because scene-2 was added and scene-3 was removed
      const ch1 = diffs.find((d) => d.chapterId === "chapter-1");
      expect(ch1?.status).toBe("changed");
      expect(ch1?.scenes).toContainEqual({ sceneId: "scene-1", status: "unchanged" });
      expect(ch1?.scenes).toContainEqual({ sceneId: "scene-2", status: "added" });
      expect(ch1?.scenes).toContainEqual({ sceneId: "scene-3", status: "removed" });

      // Chapter 2 is added
      const ch2 = diffs.find((d) => d.chapterId === "chapter-2");
      expect(ch2?.status).toBe("added");
    });
  });

  describe("restoreBookSnapshot", () => {
    it("destructively restores snapshot state, purges facts, and increments manuscriptRevision", async () => {
      // Live state
      docStore["books/book-1"] = { manuscriptRevision: 1 };
      docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
      docStore["books/book-1/facts/fact-1"] = { description: "Elena's scarf" };

      // Snapshot state
      const snapBase = "books/book-1/snapshots/snap-restore";
      docStore[`${snapBase}`] = { name: "Backup" };
      docStore[`${snapBase}/vision/main`] = { theme: "Restored adventure" };
      docStore[`${snapBase}/chapters/chapter-restored`] = { order: 0 };
      docStore[`${snapBase}/chapters/chapter-restored/scenes/scene-restored`] = {
        text: "Restored text",
        order: 0,
      };

      await restoreBookSnapshot("book-1", "snap-restore", true, "user-123");

      // Facts and old chapters are purged
      expect(docStore["books/book-1/facts/fact-1"]).toBeUndefined();
      expect(docStore["books/book-1/chapters/chapter-1"]).toBeUndefined();
      expect(deletedPaths).toContain("books/book-1/facts/fact-1");
      expect(deletedPaths).toContain("books/book-1/chapters/chapter-1");

      // Restored content matches snapshot
      expect(docStore["books/book-1/vision/main"]).toEqual({ theme: "Restored adventure" });
      expect(docStore["books/book-1/chapters/chapter-restored"]).toEqual({
        order: 0,
        restoredFromSnapshot: "snap-restore",
      });
      expect(docStore["books/book-1/chapters/chapter-restored/scenes/scene-restored"]).toEqual({
        text: "Restored text",
        order: 0,
        restoredFromSnapshot: "snap-restore",
      });

      // manuscriptRevision is incremented
      expect(updateCalls["books/book-1"]).toEqual({
        manuscriptRevision: 2,
        restoredAt: "server-timestamp",
      });
    });

    it("throws error if restore is not explicitly confirmed", async () => {
      await expect(
        restoreBookSnapshot("book-1", "snap-restore", false, "user-123"),
      ).rejects.toThrow("This operation is destructive and requires confirmation.");
    });
  });

  describe("exportBookManuscript", () => {
    it("compiles content and generates a signed Storage URL", async () => {
      docStore["books/book-1/chapters/chapter-1"] = { order: 0 };
      docStore["books/book-1/chapters/chapter-1/scenes/scene-1"] = {
        text: "Opening scene.",
        order: 0,
      };

      getSignedUrlMock.mockResolvedValue(["http://google-storage/mock-signed-url"]);

      const url = await exportBookManuscript("book-1", "markdown", "user-123");

      expect(url).toBe("http://google-storage/mock-signed-url");
      expect(saveMock).toHaveBeenCalledWith(
        expect.stringContaining("# Elena's Legacy\n\n## Chapter 1\n\nOpening scene."),
        {
          contentType: "text/markdown",
          metadata: { cacheControl: "private, no-store" },
        },
      );
    });

    it("fails securely when a signed URL cannot be generated", async () => {
      getSignedUrlMock.mockRejectedValue(new Error("signing unavailable"));

      await expect(exportBookManuscript("book-1", "plain-text", "user-123")).rejects.toThrow(
        "signing unavailable",
      );
      expect(publicUrlMock).not.toHaveBeenCalled();
    });
  });
});

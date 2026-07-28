import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFirestoreMock, randomUUIDMock, deleteSentinel } = vi.hoisted(() => ({
  getFirestoreMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  deleteSentinel: Symbol("delete"),
}));

vi.mock("node:crypto", () => ({ randomUUID: randomUUIDMock }));
vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: getFirestoreMock,
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-time"),
    delete: vi.fn(() => deleteSentinel),
  },
}));

import {
  acceptGeneratedCandidate,
  claimInitialGeneration,
  claimRegeneration,
  revertGeneratedCandidate,
  saveGeneratedCandidate,
} from "./scenes.js";

type Stored = Record<string, unknown>;

class FakeSnapshot {
  constructor(
    public readonly id: string,
    private readonly value: Stored | undefined,
  ) {}
  get exists() {
    return this.value !== undefined;
  }
  data() {
    return this.value;
  }
}

class FakeQuerySnapshot {
  constructor(public readonly docs: FakeSnapshot[]) {}
  get empty() {
    return this.docs.length === 0;
  }
}

class FakeQuery {
  constructor(
    public readonly prefix: string,
    public readonly direction: "asc" | "desc",
    public readonly count: number,
  ) {}
}

class FakeCollection {
  constructor(
    private readonly db: FakeDb,
    public readonly path: string,
  ) {}
  doc(id?: string) {
    return new FakeRef(this.db, `${this.path}/${id ?? this.db.autoId()}`);
  }
  orderBy(_field: string, direction: "asc" | "desc") {
    return {
      limit: (count: number) => new FakeQuery(this.path, direction, count),
    };
  }
}

class FakeRef {
  constructor(
    private readonly db: FakeDb,
    public readonly path: string,
  ) {}
  get id() {
    return this.path.split("/").at(-1) ?? "";
  }
  collection(name: string) {
    return new FakeCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return new FakeSnapshot(this.id, this.db.docs.get(this.path));
  }
}

class FakeDb {
  docs = new Map<string, Stored>();
  private nextId = 0;
  autoId() {
    this.nextId += 1;
    return `auto-${this.nextId}`;
  }
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  async runTransaction<T>(work: (transaction: FakeTransaction) => Promise<T>) {
    return work(new FakeTransaction(this));
  }
}

function applyUpdate(target: Stored, patch: Stored) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split(".");
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
      const nested = cursor[part];
      if (typeof nested !== "object" || nested === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Stored;
    }
    const leaf = parts.at(-1) as string;
    if (value === deleteSentinel) {
      delete cursor[leaf];
    } else {
      cursor[leaf] = value;
    }
  }
}

class FakeTransaction {
  constructor(private readonly db: FakeDb) {}
  async get(target: FakeRef | FakeQuery) {
    if (target instanceof FakeQuery) {
      const prefix = `${target.prefix}/`;
      const rows = [...this.db.docs.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
        .map(([path, value]) => new FakeSnapshot(path.split("/").at(-1) ?? "", value))
        .sort((a, b) => {
          const left = (a.data()?.order as number | undefined) ?? 0;
          const right = (b.data()?.order as number | undefined) ?? 0;
          return target.direction === "desc" ? right - left : left - right;
        })
        .slice(0, target.count);
      return new FakeQuerySnapshot(rows);
    }
    return target.get();
  }
  set(ref: FakeRef, value: Stored, options?: { merge?: boolean }) {
    if (options?.merge) {
      const target = { ...(this.db.docs.get(ref.path) ?? {}) };
      applyUpdate(target, value);
      this.db.docs.set(ref.path, target);
    } else {
      this.db.docs.set(ref.path, { ...value });
    }
  }
  update(ref: FakeRef, patch: Stored) {
    const target = { ...(this.db.docs.get(ref.path) ?? {}) };
    applyUpdate(target, patch);
    this.db.docs.set(ref.path, target);
  }
}

const attempt = { text: "Candidate.", provider: "openai" as const, model: "gpt-test" };

function activeSession(overrides: Stored = {}): Stored {
  return {
    bookId: "book-1",
    chapterId: "chapter-1",
    input: { mode: "free-text", description: "A scene" },
    assembledContext: { priorScenesText: [] },
    manuscriptRevision: 0,
    candidate: { ...attempt },
    revision: 0,
    messageId: "message-1",
    status: "active",
    ...overrides,
  };
}

describe("scene persistence service", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    getFirestoreMock.mockReturnValue(db);
    randomUUIDMock.mockReset();
    randomUUIDMock.mockReturnValue("attempt-token");
  });

  it("leases an initial request and suppresses a duplicate while the lease is active", async () => {
    await expect(claimInitialGeneration("book-1", "request-123")).resolves.toEqual({
      status: "claimed",
      attemptToken: "attempt-token",
    });
    await expect(claimInitialGeneration("book-1", "request-123")).resolves.toEqual({
      status: "in-progress",
    });
  });

  it("autosaves with compare-and-set and updates the linked message by id", async () => {
    db.docs.set("books/book-1/sessions/session-1", activeSession());
    db.docs.set("books/book-1/messages/message-1", {
      text: "Candidate.",
      revision: 0,
    });

    const result = await saveGeneratedCandidate(
      "book-1",
      "session-1",
      "Writer edit.",
      0,
    );

    expect(result).toMatchObject({ text: "Writer edit.", revision: 1 });
    expect(db.docs.get("books/book-1/messages/message-1")).toMatchObject({
      text: "Writer edit.",
      revision: 1,
    });
  });

  it("returns a completed regenerate replay before rejecting its pre-commit revision", async () => {
    db.docs.set(
      "books/book-1/sessions/session-1",
      activeSession({
        revision: 1,
        regenerateOperation: {
          idempotencyKey: "regen-123",
          attemptToken: "token",
          leaseExpiresAt: Date.now() - 1,
          expectedRevision: 0,
          manuscriptRevision: 0,
          status: "completed",
        },
      }),
    );

    await expect(
      claimRegeneration("book-1", "session-1", "regen-123", 0),
    ).resolves.toMatchObject({
      status: "completed",
      result: { revision: 1 },
    });
  });

  it("returns canonical data for a stale autosave", async () => {
    db.docs.set(
      "books/book-1/sessions/session-1",
      activeSession({ revision: 2 }),
    );
    await expect(
      saveGeneratedCandidate("book-1", "session-1", "Stale edit.", 1),
    ).rejects.toMatchObject({
      code: "stale-revision",
      canonical: expect.objectContaining({ revision: 2 }),
    });
  });

  it("revert consumes exactly one prior attempt", async () => {
    db.docs.set(
      "books/book-1/sessions/session-1",
      activeSession({
        revision: 1,
        previousAttempt: { text: "Prior.", provider: "gemini", model: "gemini-test" },
      }),
    );
    db.docs.set("books/book-1/messages/message-1", {});

    const result = await revertGeneratedCandidate("book-1", "session-1", 1);

    expect(result).toMatchObject({ text: "Prior.", revision: 2 });
    expect(result.previousAttempt).toBeUndefined();
  });

  it("accepts once with server provenance/order and replays the same scene", async () => {
    db.docs.set("books/book-1", { uid: "user-a", manuscriptRevision: 0 });
    db.docs.set("books/book-1/sessions/session-1", activeSession());
    db.docs.set("books/book-1/chapters/chapter-1", {
      order: 0,
      nextSceneOrder: 0,
    });
    db.docs.set("books/book-1/messages/message-1", {});

    const first = await acceptGeneratedCandidate("book-1", "session-1", 0);
    const replay = await acceptGeneratedCandidate("book-1", "session-1", 0);

    expect(replay).toEqual(first);
    expect(first.order).toBe(0);
    expect(db.docs.get(`books/book-1/chapters/chapter-1/scenes/${first.sceneId}`)).toMatchObject({
      text: "Candidate.",
      order: 0,
      modelUsed: "gpt-test",
      provider: "openai",
      sourceSessionId: "session-1",
    });
    expect(db.docs.get("books/book-1/chapters/chapter-1")).toMatchObject({
      nextSceneOrder: 1,
    });
    expect(db.docs.get("books/book-1")).toMatchObject({ manuscriptRevision: 1 });
  });
});

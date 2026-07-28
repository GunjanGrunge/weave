import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFirestoreMock } = vi.hoisted(() => ({
  getFirestoreMock: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: getFirestoreMock,
}));

import {
  StyleConflictError,
  StyleNotFoundError,
  StyleValidationError,
  composeStyleInstruction,
  getBookStyleState,
  getStyleCatalog,
  normalizeStoredStyle,
  parseStyleInput,
  updateBookStyle,
} from "./styles.js";

type Stored = Record<string, unknown>;

class FakeSnapshot {
  constructor(private readonly value: Stored | undefined) {}
  get exists() {
    return this.value !== undefined;
  }
  data() {
    return this.value;
  }
}

class FakeRef {
  constructor(
    private readonly db: FakeDb,
    public readonly path: string,
  ) {}
  async get() {
    return new FakeSnapshot(this.db.docs.get(this.path));
  }
}

class FakeDb {
  docs = new Map<string, Stored>();
  collection(name: string) {
    return {
      doc: (id: string) => new FakeRef(this, `${name}/${id}`),
    };
  }
  async runTransaction<T>(
    work: (transaction: {
      get: (ref: FakeRef) => Promise<FakeSnapshot>;
      update: (ref: FakeRef, patch: Stored) => void;
    }) => Promise<T>,
  ) {
    return work({
      get: (ref) => ref.get(),
      update: (ref, patch) => {
        this.docs.set(ref.path, { ...this.docs.get(ref.path), ...patch });
      },
    });
  }
}

describe("style catalog and normalization", () => {
  it("loads the exact replaceable V1 seed with stable ids and an active default", () => {
    const catalog = getStyleCatalog();

    expect(catalog.defaultPresetId).toBe("warm-character-driven");
    expect(catalog.presets.map((preset) => preset.id)).toEqual([
      "sparse-cinematic",
      "lyrical-introspective",
      "fast-paced-thriller",
      "warm-character-driven",
      "twisty-misdirection-heavy",
      "mythic-expansive",
    ]);
    expect(catalog.presets.map(({ label, description }) => ({ label, description }))).toEqual([
      {
        label: "Sparse & Cinematic",
        description: "Lean scenes, crisp images, and momentum built through visible action.",
      },
      {
        label: "Lyrical & Introspective",
        description: "Image-rich prose with close interiority and reflective emotional movement.",
      },
      {
        label: "Fast-Paced Thriller",
        description: "Short beats, escalating pressure, and chapter turns built for urgency.",
      },
      {
        label: "Warm & Character-Driven",
        description:
          "Human, intimate scenes led by relationships, voice, and emotional consequence.",
      },
      {
        label: "Twisty & Misdirection-Heavy",
        description: "Layered reveals, withheld context, and clues that reward close reading.",
      },
      {
        label: "Mythic & Expansive",
        description:
          "A broader register with symbolic stakes, textured settings, and spacious pacing.",
      },
    ]);
    expect(catalog.presets.every((preset) => preset.active)).toBe(true);
    expect(catalog.presets.every((preset) => preset.label && preset.description)).toBe(true);
    expect(JSON.stringify(catalog)).not.toMatch(/hemingway|rowling|king|austen|tolkien|murakami/i);
  });

  it("accepts ordered blends, custom-only style, and default-on-empty", () => {
    expect(
      parseStyleInput({
        presetIds: ["fast-paced-thriller", "sparse-cinematic"],
        customInstruction: "  Keep dialogue dry.  ",
      }),
    ).toEqual({
      presetIds: ["fast-paced-thriller", "sparse-cinematic"],
      customInstruction: "Keep dialogue dry.",
    });
    expect(parseStyleInput({ presetIds: [], customInstruction: "Second person." })).toEqual({
      presetIds: [],
      customInstruction: "Second person.",
    });
    expect(parseStyleInput({ presetIds: [], customInstruction: " " })).toEqual({
      presetIds: ["warm-character-driven"],
    });
  });

  it.each([
    [{ presetIds: ["unknown"] }, "unknown"],
    [{ presetIds: ["sparse-cinematic", "sparse-cinematic"] }, "duplicate"],
    [
      {
        presetIds: ["sparse-cinematic", "lyrical-introspective", "fast-paced-thriller"],
      },
      "two",
    ],
    [{ presetIds: [], customInstruction: "x".repeat(1_001) }, "1,000"],
  ])("rejects invalid client style %#", (value, message) => {
    expect(() => parseStyleInput(value)).toThrowError(new RegExp(message, "i"));
  });

  it("normalizes malformed legacy state without exposing unknown ids", () => {
    expect(normalizeStoredStyle({ presetIds: ["retired-id"] })).toEqual({
      presetIds: ["warm-character-driven"],
    });
    expect(normalizeStoredStyle(undefined)).toEqual({
      presetIds: ["warm-character-driven"],
    });
  });

  it("composes selected presets in order and appends custom guidance once", () => {
    const instruction = composeStyleInstruction({
      presetIds: ["fast-paced-thriller", "sparse-cinematic"],
      customInstruction: "Keep dialogue dry.",
    });

    expect(instruction.indexOf("Fast-Paced Thriller")).toBeLessThan(
      instruction.indexOf("Sparse & Cinematic"),
    );
    expect(instruction.match(/Keep dialogue dry\./g)).toHaveLength(1);
  });
});

describe("revisioned book style persistence", () => {
  let db: FakeDb;

  beforeEach(() => {
    db = new FakeDb();
    getFirestoreMock.mockReturnValue(db);
  });

  it("reads legacy revision zero and updates only style fields transactionally", async () => {
    db.docs.set("books/book-1", {
      uid: "user-a",
      manuscriptRevision: 8,
      style: { presetIds: ["sparse-cinematic"] },
      untouched: "value",
    });

    expect(await getBookStyleState("book-1")).toEqual({
      style: { presetIds: ["sparse-cinematic"] },
      styleRevision: 0,
    });

    await expect(
      updateBookStyle(
        "book-1",
        { presetIds: ["lyrical-introspective"], customInstruction: "Stay close." },
        0,
      ),
    ).resolves.toEqual({
      style: {
        presetIds: ["lyrical-introspective"],
        customInstruction: "Stay close.",
      },
      styleRevision: 1,
    });
    expect(db.docs.get("books/book-1")).toEqual({
      uid: "user-a",
      manuscriptRevision: 8,
      style: {
        presetIds: ["lyrical-introspective"],
        customInstruction: "Stay close.",
      },
      styleRevision: 1,
      untouched: "value",
    });
  });

  it("returns canonical state on a stale revision and distinguishes missing books", async () => {
    db.docs.set("books/book-1", {
      style: { presetIds: ["sparse-cinematic"] },
      styleRevision: 3,
    });

    await expect(updateBookStyle("book-1", { presetIds: ["mythic-expansive"] }, 2)).rejects.toEqual(
      new StyleConflictError({ presetIds: ["sparse-cinematic"] }, 3),
    );
    await expect(
      updateBookStyle("missing", { presetIds: ["mythic-expansive"] }, 0),
    ).rejects.toBeInstanceOf(StyleNotFoundError);
  });

  it("exports typed validation failures", () => {
    expect(() => parseStyleInput({ presetIds: "nope" })).toThrow(StyleValidationError);
  });
});

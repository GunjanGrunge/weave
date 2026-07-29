import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleChapterCreate } from "./summarizeChapter.js";
import type { FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";

// ─── Shared state ────────────────────────────────────────────────────────────

interface StoredChapter {
  order: number;
  summary?: string;
  summarizedAt?: string;
}

interface StoredScene {
  order: number;
  text: string;
}

const usageLogs: { bookId: string; task: string; result: unknown }[] = [];
const chapters: Record<string, StoredChapter> = {};  // keyed by chapterId
const scenes: Record<string, StoredScene[]> = {};    // keyed by chapterId
const updates: Record<string, Record<string, unknown>> = {};
let geminiShouldFail = false;

vi.mock("../services/automation.js", () => ({
  claimAutomationTask: vi.fn(async () => true),
  completeAutomationTask: vi.fn(async () => undefined),
  failAutomationTask: vi.fn(async () => undefined),
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../services/gemini.js", () => ({
  readModelRegistry: vi.fn(async () => ({
    chapterSummary: { primary: { provider: "gemini", model: "gemini-3.6-flash" } },
  })),
  callWithFallback: vi.fn(async () => {
    if (geminiShouldFail) throw new Error("provider down");
    return {
      text: "Elena uncovers the hidden vault and confronts her past.",
      provider: "gemini",
      model: "gemini-3.6-flash",
      inputTokens: 200,
      outputTokens: 60,
    };
  }),
  recordUsageBestEffort: vi.fn(async (bookId: string, task: string, result: unknown) => {
    usageLogs.push({ bookId, task, result });
  }),
}));

vi.mock("@google/genai", () => ({ GoogleGenAI: vi.fn() }));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => {
  // Build the mock Firestore lazily so it reads from shared state at call-time

  function makeChapterDoc(chapterId: string) {
    return {
      id: chapterId,
      collection: vi.fn((subName: string) => {
        if (subName === "scenes") {
          return {
            orderBy: vi.fn(() => ({
              get: vi.fn(async () => {
                const sceneList = scenes[chapterId] ?? [];
                return {
                  empty: sceneList.length === 0,
                  docs: sceneList.map((s, i) => ({
                    id: `scene-${i}`,
                    data: () => s,
                  })),
                };
              }),
            })),
          };
        }
        return {};
      }),
      update: vi.fn(async (data: Record<string, unknown>) => {
        updates[chapterId] = { ...(updates[chapterId] ?? {}), ...data };
        chapters[chapterId] = {
          ...chapters[chapterId]!,
          ...(data as unknown as StoredChapter),
        };
      }),
    };
  }

  function makeChaptersCollection() {
    return {
      // where() used for finding prev chapter by order value
      where: vi.fn((_field: string, _op: string, value: number) => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => {
            const entry = Object.entries(chapters).find(([, ch]) => ch.order === value);
            if (!entry) return { empty: true, docs: [] };
            const [id, data] = entry;
            return {
              empty: false,
              docs: [{ id, data: () => data }],
            };
          }),
        })),
      })),
      // doc(chapterId) used to build prevChapterRef
      doc: vi.fn((chapterId: string) => makeChapterDoc(chapterId)),
    };
  }

  return {
    FieldValue: {
      serverTimestamp: vi.fn(() => "server-timestamp"),
    },
    getFirestore: vi.fn(() => ({
      collection: vi.fn((_cName: string) => ({
        doc: vi.fn((_bookId: string) => ({
          collection: vi.fn((_subName: string) => makeChaptersCollection()),
        })),
      })),
    })),
  };
});

vi.mock("../config/secrets.js", () => ({
  GOOGLE_API_KEY: { value: () => "mock-google-key" },
  OPENAI_API_KEY: { value: () => "mock-openai-key" },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(
  order: number,
): FirestoreEvent<QueryDocumentSnapshot | undefined, { bookId: string; chapterId: string }> {
  return ({
    params: { bookId: "book-1", chapterId: `new-chapter-${order}` },
    data: {
      data: () => ({ order }),
    },
  } as unknown) as FirestoreEvent<
    QueryDocumentSnapshot | undefined,
    { bookId: string; chapterId: string }
  >;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("handleChapterCreate — summarizePreviousChapter trigger", () => {
  beforeEach(() => {
    usageLogs.length = 0;
    Object.keys(chapters).forEach((k) => delete chapters[k]);
    Object.keys(scenes).forEach((k) => delete scenes[k]);
    Object.keys(updates).forEach((k) => delete updates[k]);
    geminiShouldFail = false;
  });

  it("exits immediately when the new chapter is the first one (order === 0)", async () => {
    await handleChapterCreate(makeEvent(0));

    expect(Object.keys(updates)).toHaveLength(0);
    expect(usageLogs).toHaveLength(0);
  });

  it("exits without calling Gemini when the previous chapter already has a summary (idempotency)", async () => {
    chapters["chapter-0"] = { order: 0, summary: "An existing summary." };

    await handleChapterCreate(makeEvent(1));

    expect(Object.keys(updates)).toHaveLength(0);
    expect(usageLogs).toHaveLength(0);
  });

  it("writes a placeholder summary without calling Gemini when previous chapter has no scenes", async () => {
    chapters["chapter-0"] = { order: 0 };
    scenes["chapter-0"] = [];

    const { callWithFallback } = await import("../services/gemini.js");
    await handleChapterCreate(makeEvent(1));

    expect(callWithFallback).not.toHaveBeenCalled();
    expect(updates["chapter-0"]).toMatchObject({
      summary: "(No scenes accepted in this chapter.)",
      summarizedAt: "server-timestamp",
    });
    expect(usageLogs).toHaveLength(0);
  });

  it("calls Gemini and writes summary + summarizedAt when previous chapter has scenes", async () => {
    chapters["chapter-0"] = { order: 0 };
    scenes["chapter-0"] = [
      { order: 0, text: "Elena discovers the vault." },
      { order: 1, text: "She confronts her past." },
    ];

    await handleChapterCreate(makeEvent(1));

    expect(updates["chapter-0"]).toMatchObject({
      summary: "Elena uncovers the hidden vault and confronts her past.",
      summarizedAt: "server-timestamp",
    });
    expect(usageLogs).toHaveLength(1);
    expect(usageLogs[0]?.task).toBe("chapterSummary");
  });

  it("fails silently when Gemini throws — no crash, no user-facing error", async () => {
    chapters["chapter-0"] = { order: 0 };
    scenes["chapter-0"] = [{ order: 0, text: "A dramatic scene." }];
    geminiShouldFail = true;

    // Should not throw
    await expect(handleChapterCreate(makeEvent(1))).resolves.toBeUndefined();
    // No usage logged because the call failed
    expect(usageLogs).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";

import { handleSceneAcceptForMuse } from "./generateMuseNote.js";

interface UsageLog {
  bookId: string;
  task: string;
  result: unknown;
}

const usageLogs: UsageLog[] = [];
let visionUpdatedWith: unknown = null;
const appendedMessages: unknown[] = [];
let museModelCalledWithPrompt = "";

vi.mock("../services/gemini.js", () => ({
  readModelRegistry: vi.fn(async () => ({
    museNote: { primary: { provider: "gemini", model: "gemini-3.6-flash" } },
  })),
  callWithFallback: vi.fn(
    async (
      _config: unknown,
      _apiKeys: unknown,
      prompt: string,
      _schema?: unknown,
    ) => {
      museModelCalledWithPrompt = prompt;
      return {
        text: JSON.stringify({
          beat: "Inciting Incident",
          structuralNote: "Elena discovers the map. Focus on the mystery.",
        }),
        provider: "gemini",
        model: "gemini-3.6-flash",
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  ),
  recordUsageBestEffort: vi.fn(async (bookId: string, task: string, result: unknown) => {
    usageLogs.push({ bookId, task, result });
  }),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-timestamp"),
    arrayUnion: vi.fn((val) => ({ type: "arrayUnion", val })),
  },
  getFirestore: vi.fn(() => ({
    collection: vi.fn((cName: string) => {
      if (cName === "books") {
        return {
          doc: vi.fn((_bookId: string) => ({
            collection: vi.fn((subName: string) => {
              if (subName === "vision") {
                return {
                  doc: vi.fn((docId: string) => {
                    if (docId === "main") {
                      return {
                        get: vi.fn(async () => ({
                          exists: true,
                          data: () => ({
                            premise: "Elena burgles a ruby.",
                            theme: "Greed and redemption.",
                            structureMap: [{ beat: "Intro", sceneRef: "chapters/ch-1/scenes/sc-1" }],
                          }),
                        })),
                        update: vi.fn(async (updateData) => {
                          visionUpdatedWith = updateData;
                        }),
                      };
                    }
                    return { get: vi.fn(async () => ({ exists: false })) };
                  }),
                };
              }
              if (subName === "chapters") {
                return {
                  doc: vi.fn((_chapterId: string) => ({
                    get: vi.fn(async () => ({
                      exists: true,
                      data: () => ({
                        order: 1, // Chapter 2
                      }),
                    })),
                  })),
                  where: vi.fn((field: string, op: string, val: unknown) => {
                    expect(field).toBe("order");
                    expect(op).toBe("<");
                    expect(val).toBe(1);
                    return {
                      orderBy: vi.fn((orderField: string, dir: string) => {
                        expect(orderField).toBe("order");
                        expect(dir).toBe("asc");
                        return {
                          get: vi.fn(async () => ({
                            docs: [
                              {
                                id: "chapter-1",
                                data: () => ({
                                  order: 0,
                                  summary: "Elena meets a contact in a dusty bar.",
                                }),
                              },
                            ],
                          })),
                        };
                      }),
                    };
                  }),
                };
              }
              if (subName === "messages") {
                return {
                  orderBy: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      get: vi.fn(async () => ({
                        empty: false,
                        docs: [{ data: () => ({ order: 5 }) }],
                      })),
                    })),
                  })),
                  doc: vi.fn(() => ({
                    set: vi.fn(async (msg) => {
                      appendedMessages.push(msg);
                    }),
                  })),
                };
              }
              return {};
            }),
          })),
        };
      }
      return {};
    }),
    runTransaction: vi.fn(async (fn) => {
      const transaction = {
        get: vi.fn(async (_ref: unknown) => {
          // Mock the messages reference get inside transaction
          return {
            empty: false,
            docs: [{ data: () => ({ order: 5 }) }],
          };
        }),
        set: vi.fn((_ref: unknown, val: unknown) => {
          appendedMessages.push(val);
        }),
      };
      return fn(transaction);
    }),
  })),
}));

vi.mock("../config/secrets.js", () => ({
  GOOGLE_API_KEY: { value: () => "mock-google-key" },
  OPENAI_API_KEY: { value: () => "mock-openai-key" },
}));

function makeEvent(
  text: string,
): FirestoreEvent<
  QueryDocumentSnapshot | undefined,
  { bookId: string; chapterId: string; sceneId: string }
> {
  return ({
    params: { bookId: "book-123", chapterId: "chapter-456", sceneId: "scene-789" },
    data: {
      data: () => ({ text }),
    },
  } as unknown) as FirestoreEvent<
    QueryDocumentSnapshot | undefined,
    { bookId: string; chapterId: string; sceneId: string }
  >;
}

describe("Background generateMuseNote trigger", () => {
  beforeEach(() => {
    usageLogs.length = 0;
    visionUpdatedWith = null;
    appendedMessages.length = 0;
    museModelCalledWithPrompt = "";
  });

  it("successfully generates Muse note and updates Vision structure map", async () => {
    await handleSceneAcceptForMuse(
      makeEvent("Elena entered the treasury room, silently stepping around the lasers."),
    );

    expect(museModelCalledWithPrompt).toContain("Elena entered the treasury room");
    expect(museModelCalledWithPrompt).toContain("Elena burgles a ruby.");
    expect(museModelCalledWithPrompt).toContain("Elena meets a contact in a dusty bar.");

    expect(usageLogs).toHaveLength(1);
    expect(usageLogs[0]?.task).toBe("museNote");

    // Check appended message
    expect(appendedMessages).toHaveLength(1);
    expect(appendedMessages[0]).toEqual({
      type: "structural_note",
      text: "Elena discovers the map. Focus on the mystery.",
      order: 6,
      createdAt: "server-timestamp",
    });

    // Check Vision structure map update
    expect(visionUpdatedWith).toEqual({
      structureMap: {
        type: "arrayUnion",
        val: {
          beat: "Inciting Incident",
          sceneRef: "chapters/chapter-456/scenes/scene-789",
        },
      },
    });
  });

  it("exits early if scene text is empty", async () => {
    await handleSceneAcceptForMuse(makeEvent(""));

    expect(museModelCalledWithPrompt).toBe("");
    expect(appendedMessages).toHaveLength(0);
    expect(visionUpdatedWith).toBeNull();
  });

  it("fails gracefully without throwing when Gemini model execution fails", async () => {
    const { callWithFallback } = await import("../services/gemini.js");
    vi.mocked(callWithFallback).mockRejectedValueOnce(new Error("Gemini down"));

    // Should not throw
    await expect(
      handleSceneAcceptForMuse(makeEvent("Elena stole the ruby.")),
    ).resolves.not.toThrow();

    expect(appendedMessages).toHaveLength(0);
    expect(visionUpdatedWith).toBeNull();
  });
});

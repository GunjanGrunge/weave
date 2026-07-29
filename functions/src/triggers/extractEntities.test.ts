import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSceneAccept } from "./extractEntities.js";
import type { FirestoreEvent, QueryDocumentSnapshot } from "firebase-functions/v2/firestore";

interface FactRecord {
  name: string;
  type: string;
  description: string;
  embedding?: number[];
  updatedAt?: string;
  version?: number;
}

interface UsageLog {
  bookId: string;
  task: string;
  result: unknown;
}

const usageLogs: UsageLog[] = [];
const savedFacts: Record<string, FactRecord> = {};
let existingFactData: FactRecord | null = null;

vi.mock("../services/automation.js", () => ({
  claimAutomationTask: vi.fn(async () => true),
  completeAutomationTask: vi.fn(async () => undefined),
  failAutomationTask: vi.fn(async () => undefined),
}));

vi.mock("../services/gemini.js", () => ({
  readModelRegistry: vi.fn(async () => ({
    entityExtraction: { primary: { provider: "gemini", model: "gemini-3.5-flash-lite" } },
    embedding: { provider: "gemini", model: "gemini-embedding-2", outputDimensionality: 768 }
  })),
  callWithFallback: vi.fn(async (_config: unknown, _apiKeys: unknown, prompt: string, _schema?: unknown) => {
    if (prompt.includes("extract all key entities")) {
      return {
        text: JSON.stringify({
          entities: [
            { name: "Elena", type: "character", description: "Elena is a retired cat burglar." },
            { name: "The Crimson Inn", type: "location", description: "A dusty tavern." }
          ]
        }),
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        inputTokens: 100,
        outputTokens: 50
      };
    } else if (prompt.includes("merging new details")) {
      return {
        text: "Elena is a retired cat burglar who lives in the shadows.",
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        inputTokens: 200,
        outputTokens: 60
      };
    }
    return { text: "", provider: "gemini", model: "unknown", inputTokens: 0, outputTokens: 0 };
  }),
  recordUsageBestEffort: vi.fn(async (bookId: string, task: string, result: unknown) => {
    usageLogs.push({ bookId, task, result });
  })
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      embedContent: vi.fn(async () => ({
        embeddings: [{ values: new Array(768).fill(0.1) }],
        usageMetadata: { promptTokenCount: 15 }
      }))
    }
  }))
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-timestamp")
  },
  getFirestore: vi.fn(() => ({
    collection: vi.fn((_cName: string) => ({
      doc: vi.fn((_docId: string) => ({
        collection: vi.fn((_subName: string) => ({
          doc: vi.fn((subDocId: string) => ({
            get: vi.fn(async () => ({
              exists: existingFactData !== null && subDocId.startsWith("elena-"),
              data: vi.fn(() =>
                existingFactData !== null && subDocId.startsWith("elena-")
                  ? existingFactData
                  : undefined,
              ),
            })),
            set: vi.fn(async (data: FactRecord) => {
              savedFacts[subDocId] = data;
            })
          }))
        }))
      }))
    })),
    runTransaction: vi.fn(async (fn) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (ref: { set: (data: FactRecord) => Promise<void> }, data: FactRecord) =>
          ref.set(data),
      }),
    ),
  }))
}));

vi.mock("../config/secrets.js", () => ({
  GOOGLE_API_KEY: { value: () => "mock-google-key" },
  OPENAI_API_KEY: { value: () => "mock-openai-key" }
}));

function makeEvent(text: string): FirestoreEvent<QueryDocumentSnapshot | undefined, { bookId: string; chapterId: string; sceneId: string }> {
  return (({
    params: { bookId: "book-123", chapterId: "chapter-456", sceneId: "scene-789" },
    data: {
      data: () => ({ text })
    }
  }) as unknown) as FirestoreEvent<QueryDocumentSnapshot | undefined, { bookId: string; chapterId: string; sceneId: string }>;
}

describe("Background Entity Extraction on Scene Accept Trigger", () => {
  beforeEach(() => {
    usageLogs.length = 0;
    Object.keys(savedFacts).forEach((k) => delete savedFacts[k]);
    existingFactData = null;
  });

  it("extracts and creates new facts when none exist", async () => {
    await handleSceneAccept(makeEvent("Elena sat alone in The Crimson Inn, thinking about her past heists."));

    const elena = Object.values(savedFacts).find((fact) => fact.name === "Elena");
    const inn = Object.values(savedFacts).find((fact) => fact.name === "The Crimson Inn");
    expect(elena).toBeDefined();
    expect(elena?.type).toBe("character");
    expect(elena?.description).toBe("Elena is a retired cat burglar.");
    expect(elena?.embedding).toHaveLength(768);
    expect(elena?.updatedAt).toBe("server-timestamp");

    expect(inn).toBeDefined();
    expect(inn?.type).toBe("location");
    expect(inn?.description).toBe("A dusty tavern.");
    expect(inn?.embedding).toHaveLength(768);

    // Verify usage logging: 1 extraction and 2 embedding calls logged
    const extractionLogs = usageLogs.filter(log => log.task === "entityExtraction");
    const embeddingLogs = usageLogs.filter(log => log.task === "embedding");
    expect(extractionLogs).toHaveLength(1);
    expect(embeddingLogs).toHaveLength(2);
  });

  it("merges and updates facts when entity already exists", async () => {
    existingFactData = {
      name: "Elena",
      type: "character",
      description: "Elena is a retired cat burglar."
    };

    await handleSceneAccept(makeEvent("Elena sat alone in The Crimson Inn, thinking about her past heists."));

    // Elena should be updated with merged description
    const elena = Object.values(savedFacts).find((fact) => fact.name === "Elena");
    expect(elena).toBeDefined();
    expect(elena?.description).toBe("Elena is a retired cat burglar who lives in the shadows.");

    // Verify merge usage was logged
    const extractionLogs = usageLogs.filter(log => log.task === "entityExtraction");
    expect(extractionLogs).toHaveLength(2); // 1 initial extraction + 1 merge call
  });

  it("fails silently when scene text is empty", async () => {
    await handleSceneAccept(makeEvent(""));

    expect(Object.keys(savedFacts)).toHaveLength(0);
    expect(usageLogs).toHaveLength(0);
  });
});

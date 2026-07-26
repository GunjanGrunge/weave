import { describe, it, expect, vi, beforeEach } from "vitest";

import type { VisionDocument } from "../types/vision.js";

const { generateContentMock, usageWrites, serverTimestampMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  usageWrites: [] as unknown[],
  serverTimestampMock: vi.fn(() => "server-time"),
}));

let registryData: unknown;

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAIMock(this: { models: unknown }) {
    this.models = { generateContent: generateContentMock };
  }),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: serverTimestampMock },
  getFirestore: vi.fn(() => ({
    collection: (name: string) => {
      if (name === "config") {
        return {
          doc: () => ({
            get: async () => ({
              exists: registryData !== undefined,
              data: () => registryData,
            }),
          }),
        };
      }
      if (name === "books") {
        return {
          doc: () => ({
            collection: () => ({
              doc: () => ({
                set: async (data: unknown) => {
                  usageWrites.push(data);
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  })),
}));

const validRegistry = {
  openingSuggestion: { model: "gemini-3.1-pro-preview", fallback: "gemini-2.5-pro" },
};

const vision: VisionDocument = {
  theme: "A heist novel",
  premise: "One last job goes sideways.",
  characterIntents: ["A retired cat burglar"],
  structureMap: [],
  guidanceDial: "normal",
  threads: [],
};

const validOpenings = {
  openings: [
    { text: "Open mid-heist.", rationale: "Drops the reader into immediate stakes." },
    { text: "Open the morning after retirement.", rationale: "Contrasts calm before the job." },
  ],
};

function responseFor(payload: unknown, promptTokenCount = 10, candidatesTokenCount = 20) {
  return {
    text: JSON.stringify(payload),
    usageMetadata: { promptTokenCount, candidatesTokenCount },
  };
}

describe("generateOpeningSuggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    usageWrites.length = 0;
    registryData = validRegistry;
  });

  it("uses the registry's primary model and records a usage entry on success", async () => {
    const { generateOpeningSuggestions } = await import("./gemini.js");
    generateContentMock.mockResolvedValue(responseFor(validOpenings));

    const result = await generateOpeningSuggestions("book-1", vision, "fake-key");

    expect(result.openings).toHaveLength(2);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.1-pro-preview" }),
    );
    expect(usageWrites).toEqual([
      expect.objectContaining({
        task: "openingSuggestion",
        model: "gemini-3.1-pro-preview",
        inputTokens: 10,
        outputTokens: 20,
      }),
    ]);
  });

  it("retries against the fallback model when the primary call fails, and logs the fallback model", async () => {
    const { generateOpeningSuggestions } = await import("./gemini.js");
    generateContentMock
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(responseFor(validOpenings, 5, 8));

    const result = await generateOpeningSuggestions("book-1", vision, "fake-key");

    expect(result.openings).toHaveLength(2);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "gemini-2.5-pro" }),
    );
    expect(usageWrites).toEqual([
      expect.objectContaining({ model: "gemini-2.5-pro", inputTokens: 5, outputTokens: 8 }),
    ]);
  });

  it("throws GeminiError and writes no usage entry when both primary and fallback fail", async () => {
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");
    generateContentMock.mockRejectedValue(new Error("down"));

    await expect(generateOpeningSuggestions("book-1", vision, "fake-key")).rejects.toBeInstanceOf(
      GeminiError,
    );
    expect(usageWrites).toHaveLength(0);
  });

  it("throws GeminiError when the response fails schema validation (fewer than 2 openings)", async () => {
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");
    generateContentMock.mockResolvedValue(responseFor({ openings: [{ text: "Only one" }] }));

    await expect(generateOpeningSuggestions("book-1", vision, "fake-key")).rejects.toBeInstanceOf(
      GeminiError,
    );
    expect(usageWrites).toHaveLength(0);
  });

  it("throws GeminiError when the model registry doc does not exist", async () => {
    registryData = undefined;
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");

    await expect(generateOpeningSuggestions("book-1", vision, "fake-key")).rejects.toBeInstanceOf(
      GeminiError,
    );
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { VisionDocument } from "../types/vision.js";

const { fetchMock, generateContentMock, usageWrites, usageDocIds, serverTimestampMock } = vi.hoisted(
  () => ({
    fetchMock: vi.fn(),
    generateContentMock: vi.fn(),
    usageWrites: [] as unknown[],
    usageDocIds: [] as Array<string | undefined>,
    serverTimestampMock: vi.fn(() => "server-time"),
  }),
);

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
              doc: (id?: string) => ({
                set: async (data: unknown) => {
                  usageDocIds.push(id);
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
  generate: {
    primary: { provider: "openai", model: "gpt-5.6-sol" },
    fallback: { provider: "gemini", model: "gemini-2.5-pro" },
  },
  openingSuggestion: {
    primary: { provider: "openai", model: "gpt-5.6-terra" },
    fallback: { provider: "gemini", model: "gemini-2.5-pro" },
  },
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

function geminiResponseFor(payload: unknown, promptTokenCount = 10, candidatesTokenCount = 20) {
  return {
    text: JSON.stringify(payload),
    usageMetadata: { promptTokenCount, candidatesTokenCount },
  };
}

function openAIResponseFor(payload: unknown, inputTokens = 10, outputTokens = 20) {
  return {
    ok: true,
    json: async () => ({
      output: [{ content: [{ text: JSON.stringify(payload) }] }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  };
}

describe("generateOpeningSuggestions", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    generateContentMock.mockReset();
    usageWrites.length = 0;
    usageDocIds.length = 0;
    registryData = validRegistry;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses OpenAI as the registry primary model and records a usage entry on success", async () => {
    const { generateOpeningSuggestions } = await import("./gemini.js");
    fetchMock.mockResolvedValue(openAIResponseFor(validOpenings));

    const result = await generateOpeningSuggestions("book-1", vision, {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result.openings).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "gpt-5.6-terra",
      text: { format: { type: "json_schema", name: "opening_suggestions" } },
    });
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(request.headers).toMatchObject({
      Authorization: "Bearer fake-openai-key",
    });
    expect(usageWrites).toEqual([
      expect.objectContaining({
        task: "openingSuggestion",
        provider: "openai",
        model: "gpt-5.6-terra",
        inputTokens: 10,
        outputTokens: 20,
      }),
    ]);
  });

  it("retries against the Gemini fallback model when the OpenAI primary call fails, and logs the fallback model", async () => {
    const { generateOpeningSuggestions } = await import("./gemini.js");
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    generateContentMock.mockResolvedValue(geminiResponseFor(validOpenings, 5, 8));

    const result = await generateOpeningSuggestions("book-1", vision, {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result.openings).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-pro" }),
    );
    expect(usageWrites).toEqual([
      expect.objectContaining({
        task: "openingSuggestion",
        provider: "gemini",
        model: "gemini-2.5-pro",
        inputTokens: 5,
        outputTokens: 8,
      }),
    ]);
  });

  it("throws GeminiError and writes no usage entry when both primary and fallback fail", async () => {
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    generateContentMock.mockRejectedValue(new Error("down"));

    await expect(
      generateOpeningSuggestions("book-1", vision, {
        openai: "fake-openai-key",
        gemini: "fake-gemini-key",
      }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(usageWrites).toHaveLength(0);
  });

  it("throws GeminiError when the response fails schema validation (fewer than 2 openings)", async () => {
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");
    fetchMock.mockResolvedValue(openAIResponseFor({ openings: [{ text: "Only one" }] }));
    generateContentMock.mockResolvedValue(geminiResponseFor({ openings: [{ text: "Only one" }] }));

    await expect(
      generateOpeningSuggestions("book-1", vision, {
        openai: "fake-openai-key",
        gemini: "fake-gemini-key",
      }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(usageWrites).toHaveLength(0);
  });

  it("throws GeminiError when the model registry doc does not exist", async () => {
    registryData = undefined;
    const { generateOpeningSuggestions, GeminiError } = await import("./gemini.js");

    await expect(
      generateOpeningSuggestions("book-1", vision, {
        openai: "fake-openai-key",
        gemini: "fake-gemini-key",
      }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function openAITextResponseFor(text: string, inputTokens = 10, outputTokens = 20) {
  return {
    ok: true,
    json: async () => ({
      output_text: text,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  };
}

function geminiTextResponseFor(text: string, promptTokenCount = 5, candidatesTokenCount = 8) {
  return { text, usageMetadata: { promptTokenCount, candidatesTokenCount } };
}

describe("generateScene", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    generateContentMock.mockReset();
    usageWrites.length = 0;
    usageDocIds.length = 0;
    registryData = validRegistry;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the registry's generate primary (OpenAI) and returns plain prose text", async () => {
    const { generateScene } = await import("./gemini.js");
    fetchMock.mockResolvedValue(openAITextResponseFor("The vault door groaned open."));

    const result = await generateScene("book-1", "Write a heist scene.", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result).toEqual({
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-sol",
    });
    expect(generateContentMock).not.toHaveBeenCalled();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({ model: "gpt-5.6-sol" });
  });

  it("falls back to Gemini when the OpenAI primary call fails", async () => {
    const { generateScene } = await import("./gemini.js");
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    generateContentMock.mockResolvedValue(geminiTextResponseFor("Fallback scene text."));

    const result = await generateScene("book-1", "Write a heist scene.", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result).toEqual({ text: "Fallback scene text.", provider: "gemini", model: "gemini-2.5-pro" });
  });

  it("throws GeminiError when both primary and fallback fail", async () => {
    const { generateScene, GeminiError } = await import("./gemini.js");
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    generateContentMock.mockRejectedValue(new Error("down"));

    await expect(
      generateScene("book-1", "Write a heist scene.", {
        openai: "fake-openai-key",
        gemini: "fake-gemini-key",
      }),
    ).rejects.toBeInstanceOf(GeminiError);
    expect(usageWrites).toHaveLength(0);
  });

  it("records a per-call usage entry using an auto-generated doc id, not the fixed openingSuggestion-style id", async () => {
    const { generateScene } = await import("./gemini.js");
    fetchMock.mockResolvedValue(openAITextResponseFor("Scene one."));

    await generateScene("book-1", "Write scene one.", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });
    fetchMock.mockResolvedValue(openAITextResponseFor("Scene two."));
    await generateScene("book-1", "Write scene two.", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(usageWrites).toHaveLength(2);
    expect(usageDocIds).toEqual([undefined, undefined]);
    expect(usageWrites).toEqual([
      expect.objectContaining({ task: "generate", provider: "openai", model: "gpt-5.6-sol" }),
      expect.objectContaining({ task: "generate", provider: "openai", model: "gpt-5.6-sol" }),
    ]);
  });
});

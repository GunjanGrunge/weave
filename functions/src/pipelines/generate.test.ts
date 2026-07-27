import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SceneInput } from "../types/sceneInput.js";

const {
  assembleContextMock,
  composePromptMock,
  generateSceneMock,
  sessionSetMock,
  serverTimestampMock,
} = vi.hoisted(() => ({
  assembleContextMock: vi.fn(),
  composePromptMock: vi.fn(),
  generateSceneMock: vi.fn(),
  sessionSetMock: vi.fn(),
  serverTimestampMock: vi.fn(() => "server-time"),
}));

vi.mock("./assembleContext.js", () => ({ assembleContext: assembleContextMock }));
vi.mock("./composePrompt.js", () => ({ composePrompt: composePromptMock }));
vi.mock("../services/gemini.js", () => ({ generateScene: generateSceneMock }));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: serverTimestampMock },
  getFirestore: vi.fn(() => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            id: "session-auto-id",
            set: sessionSetMock,
          }),
        }),
      }),
    }),
  })),
}));

import { runGenerate } from "./generate.js";

const apiKeys = { openai: "fake-openai-key", gemini: "fake-gemini-key" };
const assembledContext = { chapterId: "chapter-1", priorScenesText: ["Scene one."] };

describe("runGenerate", () => {
  beforeEach(() => {
    assembleContextMock.mockReset();
    composePromptMock.mockReset();
    generateSceneMock.mockReset();
    sessionSetMock.mockReset();
    sessionSetMock.mockResolvedValue(undefined);
  });

  it("runs assembleContext -> composePrompt -> generateScene -> persistSession and returns the session id", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({
      prompt: "Composed prompt text.",
      style: { presetIds: [] },
    });
    generateSceneMock.mockResolvedValue({
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
    });

    const result = await runGenerate("book-1", { mode: "free-text", description: "A heist scene." }, apiKeys);

    expect(result).toEqual({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-auto-id",
    });
    expect(assembleContextMock).toHaveBeenCalledWith("book-1");
    expect(composePromptMock).toHaveBeenCalledWith(
      "book-1",
      assembledContext,
      { mode: "free-text", description: "A heist scene." },
    );
    expect(generateSceneMock).toHaveBeenCalledWith("book-1", "Composed prompt text.", apiKeys);
    expect(sessionSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: "chapter-1",
        assembledContext: { priorScenesText: ["Scene one."] },
        composedPrompt: "Composed prompt text.",
      }),
    );
  });

  it("never leaks the assembled context or composed prompt to the returned result", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({ prompt: "Composed prompt text.", style: { presetIds: [] } });
    generateSceneMock.mockResolvedValue({ text: "Scene text.", provider: "openai", model: "gpt-5.6-terra" });

    const result = await runGenerate("book-1", { mode: "free-text", description: "A heist scene." }, apiKeys);

    expect(result).not.toHaveProperty("prompt");
    expect(result).not.toHaveProperty("assembledContext");
    expect(JSON.stringify(result)).not.toContain("Composed prompt text.");
  });

  it("returns {status: 'failed'} when the book or vision document is missing (composePrompt returns undefined)", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue(undefined);

    const result = await runGenerate("missing-book", { mode: "free-text", description: "A heist scene." }, apiKeys);

    expect(result).toEqual({ status: "failed" });
    expect(generateSceneMock).not.toHaveBeenCalled();
    expect(sessionSetMock).not.toHaveBeenCalled();
  });

  it("returns {status: 'failed'} without throwing when the model call fails", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({ prompt: "Composed prompt text.", style: { presetIds: [] } });
    generateSceneMock.mockRejectedValue(new Error("Both providers failed"));

    const result = await runGenerate("book-1", { mode: "free-text", description: "A heist scene." }, apiKeys);

    expect(result).toEqual({ status: "failed" });
    expect(sessionSetMock).not.toHaveBeenCalled();
  });

  it("still returns the generated scene text as a success when session persistence fails", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({ prompt: "Composed prompt text.", style: { presetIds: [] } });
    generateSceneMock.mockResolvedValue({
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
    });
    sessionSetMock.mockRejectedValue(new Error("Firestore write failed"));

    const result = await runGenerate("book-1", { mode: "free-text", description: "A heist scene." }, apiKeys);

    expect(result).toEqual({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "",
    });
  });

  it("passes a structured SceneInput through to composePrompt unchanged", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({ prompt: "Composed prompt text.", style: { presetIds: [] } });
    generateSceneMock.mockResolvedValue({
      text: "Scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
    });

    const structuredInput = { mode: "structured" as const, fields: { mood: "tense" } };
    const result = await runGenerate("book-1", structuredInput, apiKeys);

    expect(composePromptMock).toHaveBeenCalledWith("book-1", assembledContext, structuredInput);
    expect(generateSceneMock).toHaveBeenCalledWith("book-1", "Composed prompt text.", apiKeys);
    expect(result).toEqual({
      status: "ok",
      text: "Scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-auto-id",
    });
  });

  it("passes a polish SceneInput through to composePrompt unchanged", async () => {
    assembleContextMock.mockResolvedValue(assembledContext);
    composePromptMock.mockResolvedValue({ prompt: "Composed prompt text.", style: { presetIds: [] } });
    generateSceneMock.mockResolvedValue({
      text: "Rewritten scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
    });

    const polishInput: SceneInput = {
      mode: "polish",
      draftText: "Mara walked into the vault.",
      aspects: ["raise-tension"],
    };
    const result = await runGenerate("book-1", polishInput, apiKeys);

    expect(composePromptMock).toHaveBeenCalledWith("book-1", assembledContext, polishInput);
    expect(generateSceneMock).toHaveBeenCalledWith("book-1", "Composed prompt text.", apiKeys);
    expect(result).toEqual({
      status: "ok",
      text: "Rewritten scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-auto-id",
    });
  });
});

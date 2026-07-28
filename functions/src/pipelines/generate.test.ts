import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assembleContextMock,
  composePromptMock,
  generateSceneMock,
  claimInitialGenerationMock,
  persistGeneratedCandidateMock,
  claimRegenerationMock,
  commitRegenerationMock,
  failInitialGenerationMock,
  failRegenerationMock,
  getBookMock,
} = vi.hoisted(() => ({
  assembleContextMock: vi.fn(),
  composePromptMock: vi.fn(),
  generateSceneMock: vi.fn(),
  claimInitialGenerationMock: vi.fn(),
  persistGeneratedCandidateMock: vi.fn(),
  claimRegenerationMock: vi.fn(),
  commitRegenerationMock: vi.fn(),
  failInitialGenerationMock: vi.fn(),
  failRegenerationMock: vi.fn(),
  getBookMock: vi.fn(),
}));

vi.mock("./assembleContext.js", () => ({ assembleContext: assembleContextMock }));
vi.mock("./composePrompt.js", () => ({ composePrompt: composePromptMock }));
vi.mock("../services/gemini.js", () => ({ generateScene: generateSceneMock }));
vi.mock("../services/books.js", () => ({ getBook: getBookMock }));
vi.mock("../services/scenes.js", () => ({
  claimInitialGeneration: claimInitialGenerationMock,
  persistGeneratedCandidate: persistGeneratedCandidateMock,
  claimRegeneration: claimRegenerationMock,
  commitRegeneration: commitRegenerationMock,
  failInitialGeneration: failInitialGenerationMock,
  failRegeneration: failRegenerationMock,
}));

import { runGenerate, runRegenerate } from "./generate.js";

const keys = { openai: "openai", gemini: "gemini" };
const context = {
  chapterId: "chapter-1",
  priorScenesText: ["Earlier scene."],
  manuscriptRevision: 2,
};
const persisted = {
  sessionId: "session-1",
  messageId: "message-1",
  text: "Generated prose.",
  revision: 0,
  candidateStatus: "active" as const,
  provider: "openai" as const,
  model: "gpt-test",
};

describe("generation pipelines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimInitialGenerationMock.mockResolvedValue({
      status: "claimed",
      attemptToken: "token-1",
    });
    assembleContextMock.mockResolvedValue(context);
    composePromptMock.mockResolvedValue({ prompt: "live prompt" });
    generateSceneMock.mockResolvedValue({
      text: "Generated prose.",
      provider: "openai",
      model: "gpt-test",
    });
    persistGeneratedCandidateMock.mockResolvedValue(persisted);
    getBookMock.mockResolvedValue({ manuscriptRevision: 2 });
  });

  it("claims before inference and persists an actionable candidate without caching the prompt", async () => {
    const input = { mode: "free-text" as const, description: "A tense meeting." };

    await expect(
      runGenerate("book-1", input, keys, {
        idempotencyKey: "request-123",
        userMessage: "A tense meeting.",
      }),
    ).resolves.toEqual({ status: "ok", actionable: true, ...persisted });

    expect(claimInitialGenerationMock).toHaveBeenCalledBefore(assembleContextMock);
    expect(composePromptMock).toHaveBeenCalledWith("book-1", context, input);
    expect(persistGeneratedCandidateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptToken: "token-1",
        assembledContext: context,
        candidate: expect.objectContaining({ text: "Generated prose." }),
      }),
    );
    expect(JSON.stringify(persistGeneratedCandidateMock.mock.calls[0]?.[0])).not.toContain(
      "live prompt",
    );
    expect(generateSceneMock).toHaveBeenCalledTimes(1);
    expect(generateSceneMock).toHaveBeenCalledWith(
      "book-1",
      "live prompt",
      keys,
      "generate",
    );
  });

  it("does not run a second model call for in-progress or completed replays", async () => {
    claimInitialGenerationMock.mockResolvedValueOnce({ status: "in-progress" });
    await expect(
      runGenerate("book-1", { mode: "free-text", description: "x" }, keys),
    ).resolves.toEqual({ status: "in-progress" });

    claimInitialGenerationMock.mockResolvedValueOnce({
      status: "completed",
      result: persisted,
    });
    await expect(
      runGenerate("book-1", { mode: "free-text", description: "x" }, keys),
    ).resolves.toEqual({ status: "ok", actionable: true, ...persisted });
    expect(generateSceneMock).not.toHaveBeenCalled();
  });

  it("returns generated prose as read-only when durable persistence fails", async () => {
    persistGeneratedCandidateMock.mockRejectedValue(new Error("write failed"));

    const result = await runGenerate("book-1", { mode: "free-text", description: "x" }, keys);

    expect(result).toMatchObject({
      status: "ok",
      actionable: false,
      sessionId: "",
      text: "Generated prose.",
    });
  });

  it("releases an initial claim immediately when the provider fails", async () => {
    generateSceneMock.mockRejectedValue(new Error("provider down"));

    await expect(
      runGenerate("book-1", { mode: "free-text", description: "x" }, keys, {
        idempotencyKey: "request-123",
        userMessage: "x",
      }),
    ).resolves.toEqual({ status: "failed" });

    expect(failInitialGenerationMock).toHaveBeenCalledWith(
      "book-1",
      "request-123",
      "token-1",
    );
  });

  it("reuses cached retrieval at the same manuscript revision while composing live", async () => {
    claimRegenerationMock.mockResolvedValue({
      status: "claimed",
      attemptToken: "regen-token",
      session: {
        ...persisted,
        bookId: "book-1",
        chapterId: "chapter-1",
        input: { mode: "free-text", description: "Original input" },
        assembledContext: { priorScenesText: ["Cached scene."] },
        manuscriptRevision: 2,
        candidate: { text: "Old", provider: "openai", model: "old-model" },
        status: "active",
      },
    });
    commitRegenerationMock.mockResolvedValue({ ...persisted, revision: 1 });

    await runRegenerate("book-1", "session-1", 0, "regen-123", keys);

    expect(assembleContextMock).not.toHaveBeenCalled();
    expect(composePromptMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({ priorScenesText: ["Cached scene."], manuscriptRevision: 2 }),
      { mode: "free-text", description: "Original input" },
    );
    expect(generateSceneMock).toHaveBeenCalledTimes(1);
    expect(generateSceneMock).toHaveBeenCalledWith(
      "book-1",
      "live prompt",
      keys,
      "regenerate",
    );
  });

  it("reassembles retrieval when the manuscript revision changed", async () => {
    claimRegenerationMock.mockResolvedValue({
      status: "claimed",
      attemptToken: "regen-token",
      session: {
        chapterId: "chapter-1",
        input: { mode: "free-text", description: "Original input" },
        assembledContext: { priorScenesText: ["Old cache."] },
        manuscriptRevision: 1,
        candidate: { text: "Old", provider: "openai", model: "old-model" },
        revision: 0,
        status: "active",
      },
    });
    getBookMock.mockResolvedValue({ manuscriptRevision: 2 });
    commitRegenerationMock.mockResolvedValue({ ...persisted, revision: 1 });

    await runRegenerate("book-1", "session-1", 0, "regen-123", keys);

    expect(assembleContextMock).toHaveBeenCalledWith("book-1");
  });

  it("preserves the current candidate when regeneration fails", async () => {
    claimRegenerationMock.mockResolvedValue({
      status: "claimed",
      attemptToken: "regen-token",
      session: {
        chapterId: "chapter-1",
        input: { mode: "free-text", description: "Original input" },
        assembledContext: { priorScenesText: [] },
        manuscriptRevision: 2,
        candidate: { text: "Keep me", provider: "openai", model: "old-model" },
        revision: 0,
        status: "active",
      },
    });
    generateSceneMock.mockRejectedValue(new Error("provider down"));

    await expect(runRegenerate("book-1", "session-1", 0, "regen-123", keys)).resolves.toEqual({
      status: "failed",
    });
    expect(commitRegenerationMock).not.toHaveBeenCalled();
    expect(failRegenerationMock).toHaveBeenCalledWith(
      "book-1",
      "session-1",
      "regen-token",
    );
  });
});

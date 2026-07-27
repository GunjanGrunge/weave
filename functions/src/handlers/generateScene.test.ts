import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, getBookMock, appendChatMessageMock, runGenerateMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  appendChatMessageMock: vi.fn(),
  runGenerateMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  appendChatMessage: appendChatMessageMock,
}));

vi.mock("../pipelines/generate.js", () => ({ runGenerate: runGenerateMock }));

import { buildGenerateSceneResponse } from "./generateScene.js";
import { AuthError } from "../services/auth.js";

const book = { uid: "user-a", title: "A heist", style: { presetIds: [] } };
const apiKeys = { openai: "fake-openai-key", gemini: "fake-gemini-key" };

describe("buildGenerateSceneResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    appendChatMessageMock.mockReset();
    runGenerateMock.mockReset();
  });

  it("returns the generated scene and appends both the user's description and the assistant_scene chat message", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });
    appendChatMessageMock.mockResolvedValue({
      type: "assistant_scene",
      text: "The vault door groaned open.",
      order: 2,
      createdAt: "t",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "Mara breaks into the vault." },
      apiKeys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        sessionId: "session-1",
        text: "The vault door groaned open.",
        provider: "openai",
        model: "gpt-5.6-terra",
      },
    });
    expect(appendChatMessageMock).toHaveBeenNthCalledWith(
      1,
      "book-1",
      "user",
      "Mara breaks into the vault.",
    );
    expect(appendChatMessageMock).toHaveBeenNthCalledWith(
      2,
      "book-1",
      "assistant_scene",
      "The vault door groaned open.",
    );
  });

  it("still returns the generated scene when appendChatMessage fails after a successful generation", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });
    appendChatMessageMock.mockRejectedValue(new Error("Firestore write failed"));

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "Mara breaks into the vault." },
      apiKeys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        sessionId: "session-1",
        text: "The vault door groaned open.",
        provider: "openai",
        model: "gpt-5.6-terra",
      },
    });
  });

  it("returns 400 and never runs the pipeline when the description is empty or whitespace", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "   " },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(getBookMock).not.toHaveBeenCalled();
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 and never runs the pipeline when the description exceeds the max length", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "x".repeat(4001) },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(getBookMock).not.toHaveBeenCalled();
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when bookId is missing", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { description: "Mara breaks into the vault." },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildGenerateSceneResponse(undefined, {
      bookId: "book-1",
      description: "x",
    }, apiKeys);

    expect(result.statusCode).toBe(401);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "missing-book", description: "x" },
      apiKeys,
    );

    expect(result.statusCode).toBe(404);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects a book owned by another user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue(book);

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "x" },
      apiKeys,
    );

    expect(result.statusCode).toBe(401);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns a structured 502 error (not a throw) when the pipeline fails", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({ status: "failed" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "x" },
      apiKeys,
    );

    expect(result).toEqual({
      statusCode: 502,
      body: { code: "generation-failed", message: expect.any(String) },
    });
    expect(appendChatMessageMock).not.toHaveBeenCalled();
  });

  it("returns the generated scene for structured mode with all four fields and persists a summarized user message", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "structured",
        fields: {
          sceneGoal: "Escape the vault",
          mood: "tense",
          povCharacter: "Mara",
          setting: "Loading dock at 3am",
        },
      },
      apiKeys,
    );

    expect(result.statusCode).toBe(200);
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      {
        mode: "structured",
        fields: {
          sceneGoal: "Escape the vault",
          mood: "tense",
          povCharacter: "Mara",
          setting: "Loading dock at 3am",
        },
      },
      apiKeys,
    );
    expect(appendChatMessageMock).toHaveBeenNthCalledWith(
      1,
      "book-1",
      "user",
      "Scene goal: Escape the vault. Mood: tense. POV/character: Mara. Setting: Loading dock at 3am.",
    );
  });

  it("returns the generated scene for structured mode with only one field supplied, summarizing only that field", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "Scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "structured", fields: { mood: "tense" } },
      apiKeys,
    );

    expect(result.statusCode).toBe(200);
    expect(appendChatMessageMock).toHaveBeenNthCalledWith(1, "book-1", "user", "Mood: tense.");
  });

  it("returns 400 and never runs the pipeline when all structured fields are empty or whitespace", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "structured", fields: { sceneGoal: "  ", mood: "" } },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(getBookMock).not.toHaveBeenCalled();
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a single structured field exceeds the per-field length cap", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "structured", fields: { mood: "x".repeat(501) } },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("accepts four fields each at the per-field cap, bounding worst-case structured input well under the free-text budget", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "Scene text.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "structured",
        fields: {
          sceneGoal: "x".repeat(500),
          mood: "x".repeat(500),
          povCharacter: "x".repeat(500),
          setting: "x".repeat(500),
        },
      },
      apiKeys,
    );

    expect(result.statusCode).toBe(200);
    const [, sceneInput] = runGenerateMock.mock.calls[0] as [string, { mode: string; fields: Record<string, string> }];
    const combinedLength = Object.values(sceneInput.fields).reduce((total, v) => total + v.length, 0);
    expect(combinedLength).toBeLessThan(4_000);
  });

  it("returns the generated scene for polish mode and persists a summarized user message", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "A rewritten, tenser vault scene.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "polish",
        draftText: "Mara walked into the vault. It was dark.",
        aspects: ["raise-tension", "fix-dialogue"],
      },
      apiKeys,
    );

    expect(result.statusCode).toBe(200);
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      {
        mode: "polish",
        draftText: "Mara walked into the vault. It was dark.",
        aspects: ["raise-tension", "fix-dialogue"],
      },
      apiKeys,
    );
    expect(appendChatMessageMock).toHaveBeenNthCalledWith(
      1,
      "book-1",
      "user",
      "Polish draft (Raise tension, Fix dialogue): Mara walked into the vault. It was dark.",
    );
  });

  it("returns 400 and never runs the pipeline when polish draftText is empty or whitespace", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "polish", draftText: "   ", aspects: ["raise-tension"] },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(getBookMock).not.toHaveBeenCalled();
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 and never runs the pipeline when no polish aspect is selected", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "polish", draftText: "Some draft.", aspects: [] },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when an unknown polish aspect id is supplied", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "polish", draftText: "Some draft.", aspects: ["not-a-real-aspect"] },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when polish aspects contain duplicates or exceed the catalog size", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const duplicateResult = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "polish",
        draftText: "Some draft.",
        aspects: ["raise-tension", "raise-tension"],
      },
      apiKeys,
    );
    const oversizedResult = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "polish",
        draftText: "Some draft.",
        aspects: Array.from({ length: 6 }, () => "raise-tension"),
      },
      apiKeys,
    );

    expect(duplicateResult.statusCode).toBe(400);
    expect(oversizedResult.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown input mode instead of falling through to free-text", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "polsih", description: "Write a new scene." },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    if (result.statusCode !== 400) {
      throw new Error("Expected invalid input to return 400.");
    }
    expect(result.body.message).toContain("polish");
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when polish draftText exceeds the max length", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "polish",
        draftText: "x".repeat(8001),
        aspects: ["raise-tension"],
      },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("truncates a very long draft in the persisted user-message preview", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "Rewritten.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });
    const longDraft = "x".repeat(300);

    await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", mode: "polish", draftText: longDraft, aspects: ["clarify-prose"] },
      apiKeys,
    );

    const persistedMessage = appendChatMessageMock.mock.calls[0][2] as string;
    expect(persistedMessage.length).toBeLessThan(longDraft.length);
    expect(persistedMessage).toContain("…");
    // The full draft is still sent to the model, only the persisted preview is truncated.
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      { mode: "polish", draftText: longDraft, aspects: ["clarify-prose"] },
      apiKeys,
    );
  });

  it("does not split a Unicode code point at the persisted preview boundary", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "Rewritten.",
      provider: "openai",
      model: "gpt-5.6-terra",
      sessionId: "session-1",
    });
    const draftAtBoundary = `${"x".repeat(199)}😀tail`;

    await buildGenerateSceneResponse(
      "Bearer valid",
      {
        bookId: "book-1",
        mode: "polish",
        draftText: draftAtBoundary,
        aspects: ["clarify-prose"],
      },
      apiKeys,
    );

    const persistedMessage = appendChatMessageMock.mock.calls[0][2] as string;
    expect(persistedMessage).toContain("😀…");
    expect(persistedMessage).not.toContain("�");
  });

  it("returns a structured 502 error when the pipeline call times out", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: "ok" }), 50)),
    );

    const result = await buildGenerateSceneResponse(
      "Bearer valid",
      { bookId: "book-1", description: "x" },
      apiKeys,
      5,
    );

    expect(result.statusCode).toBe(502);
    expect(appendChatMessageMock).not.toHaveBeenCalled();
  });
});

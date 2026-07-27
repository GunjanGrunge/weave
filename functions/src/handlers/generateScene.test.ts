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

  it("returns the generated scene and appends it as an assistant_scene chat message", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    runGenerateMock.mockResolvedValue({
      status: "ok",
      text: "The vault door groaned open.",
      provider: "openai",
      model: "gpt-5.6-sol",
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
        model: "gpt-5.6-sol",
      },
    });
    expect(appendChatMessageMock).toHaveBeenCalledWith(
      "book-1",
      "assistant_scene",
      "The vault door groaned open.",
    );
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

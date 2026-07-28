import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, getBookMock, runGenerateMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  runGenerateMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>(
    "../services/auth.js",
  );
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});
vi.mock("../services/books.js", () => ({ getBook: getBookMock }));
vi.mock("../pipelines/generate.js", () => ({ runGenerate: runGenerateMock }));

import { AuthError } from "../services/auth.js";
import { buildGenerateSceneResponse } from "./generateScene.js";

const keys = { openai: "openai", gemini: "gemini" };
const success = {
  status: "ok" as const,
  actionable: true,
  sessionId: "session-1",
  messageId: "message-1",
  text: "Generated prose.",
  revision: 0,
  candidateStatus: "active" as const,
  provider: "openai" as const,
  model: "gpt-test",
};

describe("buildGenerateSceneResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    runGenerateMock.mockResolvedValue(success);
  });

  it("returns actionable metadata and passes a bounded client idempotency key", async () => {
    const result = await buildGenerateSceneResponse(
      "Bearer token",
      {
        bookId: "book-1",
        description: "A tense meeting.",
        idempotencyKey: "request-123",
      },
      keys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        sessionId: "session-1",
        messageId: "message-1",
        text: "Generated prose.",
        revision: 0,
        status: "active",
        provider: "openai",
        model: "gpt-test",
        actionable: true,
      },
    });
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      { mode: "free-text", description: "A tense meeting." },
      keys,
      { idempotencyKey: "request-123", userMessage: "A tense meeting." },
    );
  });

  it("returns a read-only success when persistence degraded", async () => {
    runGenerateMock.mockResolvedValue({
      ...success,
      actionable: false,
      sessionId: "",
      messageId: "",
    });

    const result = await buildGenerateSceneResponse(
      "Bearer token",
      { bookId: "book-1", description: "A tense meeting." },
      keys,
    );

    expect(result.statusCode).toBe(200);
    if (result.statusCode === 200) {
      expect(result.body.actionable).toBe(false);
      expect(result.body.sessionId).toBe("");
    }
  });

  it("maps an in-progress replay to 202 without another response shape", async () => {
    runGenerateMock.mockResolvedValue({ status: "in-progress" });
    await expect(
      buildGenerateSceneResponse(
        "Bearer token",
        { bookId: "book-1", description: "x", idempotencyKey: "request-123" },
        keys,
      ),
    ).resolves.toMatchObject({
      statusCode: 202,
      body: { code: "generation-in-progress" },
    });
  });

  it.each([
    [{ bookId: "book-1", description: " " }, "empty free text"],
    [
      { bookId: "book-1", mode: "structured", fields: { mood: " " } },
      "empty structured fields",
    ],
    [
      { bookId: "book-1", mode: "polish", draftText: "draft", aspects: [] },
      "missing polish aspects",
    ],
    [
      { bookId: "book-1", description: "x", idempotencyKey: "bad key" },
      "invalid idempotency key",
    ],
  ])("rejects invalid request: %s", async (body, _label) => {
    const result = await buildGenerateSceneResponse("Bearer token", body, keys);
    expect(result.statusCode).toBe(400);
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("passes structured input and its summary to the pipeline", async () => {
    await buildGenerateSceneResponse(
      "Bearer token",
      { bookId: "book-1", mode: "structured", fields: { mood: "tense" } },
      keys,
    );
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      { mode: "structured", fields: { mood: "tense" } },
      keys,
      expect.objectContaining({ userMessage: "Mood: tense." }),
    );
  });

  it("keeps the full polish draft for inference but bounds its message preview", async () => {
    const draftText = "x".repeat(300);
    await buildGenerateSceneResponse(
      "Bearer token",
      {
        bookId: "book-1",
        mode: "polish",
        draftText,
        aspects: ["clarify-prose"],
      },
      keys,
    );
    const call = runGenerateMock.mock.calls[0] as [
      string,
      { draftText: string },
      unknown,
      { userMessage: string },
    ];
    expect(call[1].draftText).toBe(draftText);
    expect(call[3].userMessage.length).toBeLessThan(draftText.length);
  });

  it("rejects missing authentication and cross-owner access", async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new AuthError("Missing token."));
    const missing = await buildGenerateSceneResponse(
      undefined,
      { bookId: "book-1", description: "x" },
      keys,
    );
    expect(missing.statusCode).toBe(401);

    verifyIdTokenMock.mockResolvedValueOnce({ uid: "user-b" });
    const foreign = await buildGenerateSceneResponse(
      "Bearer token",
      { bookId: "book-1", description: "x" },
      keys,
    );
    expect(foreign.statusCode).toBe(401);
  });

  it("returns 404 for a missing book and 502 for provider failure", async () => {
    getBookMock.mockResolvedValueOnce(undefined);
    const missing = await buildGenerateSceneResponse(
      "Bearer token",
      { bookId: "missing", description: "x" },
      keys,
    );
    expect(missing.statusCode).toBe(404);

    getBookMock.mockResolvedValueOnce({ uid: "user-a" });
    runGenerateMock.mockResolvedValueOnce({ status: "failed" });
    const failed = await buildGenerateSceneResponse(
      "Bearer token",
      { bookId: "book-1", description: "x" },
      keys,
    );
    expect(failed.statusCode).toBe(502);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyIdTokenMock,
  getBookMock,
  saveMock,
  revertMock,
  acceptMock,
  regenerateMock,
  fenceRegenerationMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  saveMock: vi.fn(),
  revertMock: vi.fn(),
  acceptMock: vi.fn(),
  regenerateMock: vi.fn(),
  fenceRegenerationMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>(
    "../services/auth.js",
  );
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});
vi.mock("../services/books.js", () => ({ getBook: getBookMock }));
vi.mock("../services/scenes.js", async () => {
  const actual = await vi.importActual<typeof import("../services/scenes.js")>(
    "../services/scenes.js",
  );
  return {
    ...actual,
    saveGeneratedCandidate: saveMock,
    revertGeneratedCandidate: revertMock,
    acceptGeneratedCandidate: acceptMock,
    fenceTimedOutRegeneration: fenceRegenerationMock,
  };
});
vi.mock("../pipelines/generate.js", () => ({ runRegenerate: regenerateMock }));

import { SceneSessionError } from "../services/scenes.js";
import { buildAcceptSceneResponse } from "./acceptScene.js";
import { buildRegenerateSceneResponse } from "./regenerateScene.js";
import { buildRevertGeneratedSceneResponse } from "./revertGeneratedScene.js";
import { buildSaveGeneratedSceneResponse } from "./saveGeneratedScene.js";

const canonical = {
  sessionId: "session-1",
  messageId: "message-1",
  text: "Current prose.",
  revision: 2,
  candidateStatus: "active" as const,
  provider: "openai" as const,
  model: "gpt-test",
};
const base = { bookId: "book-1", sessionId: "session-1", expectedRevision: 1 };

describe("scene mutation handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    fenceRegenerationMock.mockResolvedValue({ status: "fenced" });
  });

  it("autosaves server canonical text and revision", async () => {
    saveMock.mockResolvedValue(canonical);
    const result = await buildSaveGeneratedSceneResponse("Bearer token", {
      ...base,
      text: "Current prose.",
    });
    expect(result).toEqual({
      statusCode: 200,
      body: expect.objectContaining({ text: "Current prose.", revision: 2 }),
    });
    expect(saveMock).toHaveBeenCalledWith("book-1", "session-1", "Current prose.", 1);
  });

  it("returns canonical conflict data without overwriting stale text", async () => {
    saveMock.mockRejectedValue(
      new SceneSessionError("stale-revision", "Newer version.", canonical),
    );
    const result = await buildSaveGeneratedSceneResponse("Bearer token", {
      ...base,
      text: "My local prose.",
    });
    expect(result).toMatchObject({
      statusCode: 409,
      body: {
        code: "stale-revision",
        canonical: { text: "Current prose.", revision: 2 },
      },
    });
  });

  it("rejects empty and oversized autosave payloads", async () => {
    await expect(
      buildSaveGeneratedSceneResponse("Bearer token", { ...base, text: " " }),
    ).resolves.toMatchObject({ statusCode: 400 });
    await expect(
      buildSaveGeneratedSceneResponse("Bearer token", {
        ...base,
        text: "x".repeat(50_001),
      }),
    ).resolves.toMatchObject({ statusCode: 400 });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("reverts through the service with revision compare-and-set", async () => {
    revertMock.mockResolvedValue({ ...canonical, previousAttempt: undefined });
    await expect(
      buildRevertGeneratedSceneResponse("Bearer token", base),
    ).resolves.toMatchObject({ statusCode: 200, body: { revision: 2 } });
    expect(revertMock).toHaveBeenCalledWith("book-1", "session-1", 1);
  });

  it("accepts without trusting prose or provenance from the request", async () => {
    acceptMock.mockResolvedValue({
      sceneId: "scene-1",
      order: 0,
      session: { ...canonical, candidateStatus: "accepted" },
    });
    const result = await buildAcceptSceneResponse("Bearer token", {
      ...base,
      idempotencyKey: "accept-123",
      text: "untrusted",
      provider: "untrusted",
      order: 99,
    });
    expect(result).toMatchObject({
      statusCode: 200,
      body: { sceneId: "scene-1", order: 0, candidate: { status: "accepted" } },
    });
    expect(acceptMock).toHaveBeenCalledWith("book-1", "session-1", 1);
  });

  it("regenerates through the pipeline and returns retryable in-progress/failure states", async () => {
    regenerateMock.mockResolvedValueOnce({ status: "in-progress" });
    const body = { ...base, idempotencyKey: "regen-123" };
    await expect(
      buildRegenerateSceneResponse("Bearer token", body, {
        openai: "key",
        gemini: "key",
      }),
    ).resolves.toMatchObject({ statusCode: 202 });

    regenerateMock.mockResolvedValueOnce({ status: "failed" });
    await expect(
      buildRegenerateSceneResponse("Bearer token", body, {
        openai: "key",
        gemini: "key",
      }),
    ).resolves.toMatchObject({
      statusCode: 502,
      body: { code: "generation-failed" },
    });
  });

  it("fences a timed-out regeneration before returning failure", async () => {
    regenerateMock.mockReturnValue(new Promise(() => undefined));
    const body = { ...base, idempotencyKey: "regen-123" };

    await expect(
      buildRegenerateSceneResponse(
        "Bearer token",
        body,
        { openai: "key", gemini: "key" },
        1,
      ),
    ).resolves.toMatchObject({ statusCode: 502 });
    expect(fenceRegenerationMock).toHaveBeenCalledWith(
      "book-1",
      "session-1",
      "regen-123",
    );
  });

  it("enforces ownership before any mutation service runs", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    const result = await buildSaveGeneratedSceneResponse("Bearer token", {
      ...base,
      text: "Current prose.",
    });
    expect(result.statusCode).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });
});

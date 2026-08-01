import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyIdTokenMock,
  getBookMock,
  getVisionDocumentMock,
  getMessagesMock,
  appendMuseConversationMock,
  classifyMuseReadinessMock,
  getCanonicalRosterMock,
  runGenerateMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  getVisionDocumentMock: vi.fn(),
  getMessagesMock: vi.fn(),
  appendMuseConversationMock: vi.fn(),
  classifyMuseReadinessMock: vi.fn(),
  getCanonicalRosterMock: vi.fn(),
  runGenerateMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});
vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  getVisionDocument: getVisionDocumentMock,
  getMessages: getMessagesMock,
  appendMuseConversation: appendMuseConversationMock,
}));
vi.mock("../services/gemini.js", () => ({ classifyMuseReadiness: classifyMuseReadinessMock }));
vi.mock("../services/storyBible.js", () => ({ getCanonicalRoster: getCanonicalRosterMock }));
vi.mock("../pipelines/generate.js", () => ({ runGenerate: runGenerateMock }));

import { AuthError } from "../services/auth.js";
import { buildConsultMuseResponse } from "./consultMuse.js";

const keys = { openai: "test", gemini: "test" };

describe("buildConsultMuseResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: "writer-1" });
    getBookMock.mockResolvedValue({ uid: "writer-1" });
    getVisionDocumentMock.mockResolvedValue({ theme: "crime", premise: "A borrowed car" });
    getMessagesMock.mockResolvedValue([{ type: "user", text: "Eric is afraid.", order: 0 }]);
    getCanonicalRosterMock.mockResolvedValue({ text: "Eric: anxious." });
  });

  it("persists an editorial Muse turn without generating manuscript prose when readiness is clarify", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "clarify",
      note: "What if the car makes Eric complicit?",
      provider: "openai",
      model: "gpt-test",
    });

    await expect(
      buildConsultMuseResponse(
        "Bearer valid",
        { bookId: "book-1", message: "Make Eric feel guilty." },
        keys,
      ),
    ).resolves.toEqual({
      statusCode: 200,
      body: {
        mode: "clarify",
        text: "What if the car makes Eric complicit?",
        provider: "openai",
        model: "gpt-test",
      },
    });
    expect(classifyMuseReadinessMock).toHaveBeenCalledWith(
      "book-1",
      expect.stringMatching(
        /Classify readiness as "draft"[\s\S]*RECENT CONVERSATION:[\s\S]*Eric is afraid/,
      ),
      keys,
    );
    expect(appendMuseConversationMock).toHaveBeenCalledWith(
      "book-1",
      "Make Eric feel guilty.",
      "What if the car makes Eric complicit?",
    );
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("drafts the next stitch through runGenerate when readiness is draft", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "draft",
      note: "Opening the farewell party.",
      provider: "openai",
      model: "gpt-test",
    });
    runGenerateMock.mockResolvedValue({
      status: "ok",
      actionable: true,
      sessionId: "session-1",
      messageId: "message-1",
      text: "The party was already loud when Eric arrived.",
      revision: 0,
      candidateStatus: "active",
      provider: "openai",
      model: "gpt-test",
    });

    const result = await buildConsultMuseResponse(
      "Bearer valid",
      { bookId: "book-1", message: "A young guy celebrating his farewell, settled in." },
      keys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        mode: "draft",
        sessionId: "session-1",
        messageId: "message-1",
        text: "The party was already loud when Eric arrived.",
        provider: "openai",
        model: "gpt-test",
        revision: 0,
        status: "active",
        actionable: true,
      },
    });
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      { mode: "free-text", description: "A young guy celebrating his farewell, settled in." },
      keys,
      expect.objectContaining({
        userMessage: "A young guy celebrating his farewell, settled in.",
      }),
    );
    expect(appendMuseConversationMock).not.toHaveBeenCalled();
  });

  it("reports a failure when the draft pipeline fails", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "draft",
      note: "",
      provider: "openai",
      model: "gpt-test",
    });
    runGenerateMock.mockResolvedValue({ status: "failed" });

    await expect(
      buildConsultMuseResponse("Bearer valid", { bookId: "book-1", message: "Go." }, keys),
    ).resolves.toMatchObject({ statusCode: 502 });
  });

  it("does not call the model for invalid input or unauthenticated requests", async () => {
    await expect(
      buildConsultMuseResponse("Bearer valid", { bookId: "book-1", message: "" }, keys),
    ).resolves.toMatchObject({ statusCode: 400 });
    verifyIdTokenMock.mockRejectedValue(new AuthError("Missing token"));
    await expect(
      buildConsultMuseResponse("", { bookId: "book-1", message: "Hello" }, keys),
    ).resolves.toMatchObject({ statusCode: 401 });
    expect(classifyMuseReadinessMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotencyKey", async () => {
    await expect(
      buildConsultMuseResponse(
        "Bearer valid",
        { bookId: "book-1", message: "Hello", idempotencyKey: "!!!" },
        keys,
      ),
    ).resolves.toMatchObject({ statusCode: 400 });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyIdTokenMock,
  getBookMock,
  getVisionDocumentMock,
  getMessagesMock,
  appendMuseConversationMock,
  generateSceneMock,
  getCanonicalRosterMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  getVisionDocumentMock: vi.fn(),
  getMessagesMock: vi.fn(),
  appendMuseConversationMock: vi.fn(),
  generateSceneMock: vi.fn(),
  getCanonicalRosterMock: vi.fn(),
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
vi.mock("../services/gemini.js", () => ({ generateScene: generateSceneMock }));
vi.mock("../services/storyBible.js", () => ({ getCanonicalRoster: getCanonicalRosterMock }));

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
    generateSceneMock.mockResolvedValue({
      text: "What if the car makes Eric complicit?",
      provider: "openai",
      model: "gpt-test",
    });
  });

  it("persists an editorial Muse turn without generating manuscript prose", async () => {
    await expect(
      buildConsultMuseResponse(
        "Bearer valid",
        { bookId: "book-1", message: "Make Eric feel guilty." },
        keys,
      ),
    ).resolves.toEqual({
      statusCode: 200,
      body: {
        text: "What if the car makes Eric complicit?",
        provider: "openai",
        model: "gpt-test",
      },
    });
    expect(generateSceneMock).toHaveBeenCalledWith(
      "book-1",
      expect.stringMatching(
        /Do not draft manuscript prose[\s\S]*RECENT CONVERSATION:[\s\S]*Eric is afraid/,
      ),
      keys,
      "museConversation",
    );
    expect(appendMuseConversationMock).toHaveBeenCalledWith(
      "book-1",
      "Make Eric feel guilty.",
      "What if the car makes Eric complicit?",
    );
  });

  it("does not call the model for invalid input or unauthenticated requests", async () => {
    await expect(
      buildConsultMuseResponse("Bearer valid", { bookId: "book-1", message: "" }, keys),
    ).resolves.toMatchObject({ statusCode: 400 });
    verifyIdTokenMock.mockRejectedValue(new AuthError("Missing token"));
    await expect(
      buildConsultMuseResponse("", { bookId: "book-1", message: "Hello" }, keys),
    ).resolves.toMatchObject({ statusCode: 401 });
    expect(generateSceneMock).not.toHaveBeenCalled();
  });
});

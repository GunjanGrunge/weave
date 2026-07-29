import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyIdTokenMock,
  assertOwnershipMock,
  getBookMock,
  prepareChapterEditMock,
  enhanceChapterEditMock,
  commitChapterEditMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  assertOwnershipMock: vi.fn(),
  getBookMock: vi.fn(),
  prepareChapterEditMock: vi.fn(),
  enhanceChapterEditMock: vi.fn(),
  commitChapterEditMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return {
    ...actual,
    verifyIdToken: verifyIdTokenMock,
    assertOwnership: assertOwnershipMock,
  };
});
vi.mock("../services/books.js", () => ({ getBook: getBookMock }));
vi.mock("../services/manuscriptEditor.js", async () => {
  const actual = await vi.importActual<typeof import("../services/manuscriptEditor.js")>(
    "../services/manuscriptEditor.js",
  );
  return {
    ...actual,
    prepareChapterEdit: prepareChapterEditMock,
    enhanceChapterEdit: enhanceChapterEditMock,
    commitChapterEdit: commitChapterEditMock,
  };
});

import { AuthError } from "../services/auth.js";
import { ManuscriptEditError } from "../services/manuscriptEditor.js";
import { buildEnhanceManuscriptResponse } from "./enhanceManuscriptChapter.js";

const requestBody = {
  bookId: "book-1",
  chapterId: "chapter-1",
  originalTitle: "Chapter 1",
  draftTitle: "The Begining of the King",
  scenes: [
    {
      sceneId: "scene-1",
      originalText: "He laid down his loupe.",
      draftText: "He laid down with his book and his loupe.",
    },
  ],
};
const keys = { openai: "openai-key", gemini: "gemini-key" };

describe("buildEnhanceManuscriptResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    assertOwnershipMock.mockReset();
    getBookMock.mockReset();
    prepareChapterEditMock.mockReset();
    enhanceChapterEditMock.mockReset();
    commitChapterEditMock.mockReset();
  });

  it("authenticates, checks ownership, enhances, and commits the chapter", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({
      uid: "user-a",
      style: { presetIds: ["warm-character-driven"] },
    });
    prepareChapterEditMock.mockResolvedValue({
      chapterId: "chapter-1",
      originalTitle: "Chapter 1",
      titleDraft: "The Begining of the King",
      scenes: requestBody.scenes,
    });
    enhanceChapterEditMock.mockResolvedValue({
      title: "The Beginning of the King",
      scenes: [{ sceneId: "scene-1", text: "He laid down his book and loupe." }],
      provider: "openai",
      model: "gpt-test",
    });
    commitChapterEditMock.mockResolvedValue({
      chapterId: "chapter-1",
      title: "The Beginning of the King",
      scenes: [{ sceneId: "scene-1", text: "He laid down his book and loupe." }],
    });

    const result = await buildEnhanceManuscriptResponse("Bearer valid", requestBody, keys);

    expect(assertOwnershipMock).toHaveBeenCalledWith("user-a", "user-a");
    expect(prepareChapterEditMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({ chapterId: "chapter-1" }),
    );
    expect(enhanceChapterEditMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({ titleDraft: "The Begining of the King" }),
      { presetIds: ["warm-character-driven"] },
      keys,
    );
    expect(commitChapterEditMock).toHaveBeenCalledOnce();
    expect(result).toEqual({
      statusCode: 200,
      body: {
        chapter: {
          chapterId: "chapter-1",
          title: "The Beginning of the King",
          scenes: [{ sceneId: "scene-1", text: "He laid down his book and loupe." }],
        },
      },
    });
  });

  it("authenticates before validating the body", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Invalid token."));

    await expect(buildEnhanceManuscriptResponse("Bearer bad", null, keys)).resolves.toMatchObject({
      statusCode: 401,
    });
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized edits", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    await expect(
      buildEnhanceManuscriptResponse(
        "Bearer valid",
        { ...requestBody, draftTitle: "", scenes: [] },
        keys,
      ),
    ).resolves.toMatchObject({ statusCode: 400 });
    await expect(
      buildEnhanceManuscriptResponse(
        "Bearer valid",
        {
          ...requestBody,
          scenes: [
            {
              ...requestBody.scenes[0],
              draftText: "x".repeat(60_001),
            },
          ],
        },
        keys,
      ),
    ).resolves.toMatchObject({ statusCode: 400 });
    expect(prepareChapterEditMock).not.toHaveBeenCalled();
  });

  it("maps stale edits to conflict without committing", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", style: { presetIds: [] } });
    prepareChapterEditMock.mockRejectedValue(
      new ManuscriptEditError("conflict", "Reload before editing again."),
    );

    await expect(
      buildEnhanceManuscriptResponse("Bearer valid", requestBody, keys),
    ).resolves.toEqual({
      statusCode: 409,
      body: { code: "conflict", message: "Reload before editing again." },
    });
    expect(enhanceChapterEditMock).not.toHaveBeenCalled();
    expect(commitChapterEditMock).not.toHaveBeenCalled();
  });

  it("keeps the original manuscript when enhancement fails", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", style: { presetIds: [] } });
    prepareChapterEditMock.mockResolvedValue({
      chapterId: "chapter-1",
      originalTitle: "Chapter 1",
      scenes: requestBody.scenes,
    });
    enhanceChapterEditMock.mockRejectedValue(
      new ManuscriptEditError("generation-failed", "OpenAI returned an invalid edit."),
    );

    await expect(
      buildEnhanceManuscriptResponse("Bearer valid", requestBody, keys),
    ).resolves.toEqual({
      statusCode: 502,
      body: { code: "generation-failed", message: "OpenAI returned an invalid edit." },
    });
    expect(commitChapterEditMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, createBookWithIntakeMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  createBookWithIntakeMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});
vi.mock("../services/books.js", () => ({ createBookWithIntake: createBookWithIntakeMock }));

import { buildCreateBookResponse } from "./createBook.js";
import { AuthError } from "../services/auth.js";

const keys = { openai: "test", gemini: "test" };

describe("buildCreateBookResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    createBookWithIntakeMock.mockReset();
  });

  it("creates a quiet draft workspace without generating an opening in bulk", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "writer-1" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-1" });

    await expect(buildCreateBookResponse(
      "Bearer valid",
      { premiseAnswers: { whatToWrite: "A mystery" }, style: { presetIds: ["warm-character-driven"] } },
      keys,
    )).resolves.toEqual({ statusCode: 200, body: { bookId: "book-1" } });
    expect(createBookWithIntakeMock).toHaveBeenCalledWith("writer-1", {
      premiseAnswers: { whatToWrite: "A mystery" },
      style: { presetIds: ["warm-character-driven"] },
      genreProfile: undefined,
      voiceProfile: undefined,
      idempotencyKey: undefined,
    });
  });

  it("rejects malformed input", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "writer-1" });
    await expect(buildCreateBookResponse("Bearer valid", {}, keys)).resolves.toMatchObject({ statusCode: 400 });
  });

  it("returns 401 for an unauthenticated request", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Missing token"));
    await expect(buildCreateBookResponse("", { premiseAnswers: {}, style: { presetIds: [] } }, keys)).resolves.toMatchObject({ statusCode: 401 });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, createBookWithIntakeMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  createBookWithIntakeMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  createBookWithIntake: createBookWithIntakeMock,
}));

import { buildCreateBookResponse } from "./createBook.js";
import { AuthError } from "../services/auth.js";

describe("buildCreateBookResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    createBookWithIntakeMock.mockReset();
  });

  it("returns 200 {bookId} for a valid token and request body", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-1" });

    const result = await buildCreateBookResponse("Bearer valid", {
      premiseAnswers: { whatToWrite: "A heist" },
      style: { presetIds: ["sparse-cinematic"] },
    });

    expect(result).toEqual({ statusCode: 200, body: { bookId: "book-1" } });
    expect(createBookWithIntakeMock).toHaveBeenCalledWith("user-a", {
      premiseAnswers: { whatToWrite: "A heist" },
      style: { presetIds: ["sparse-cinematic"] },
    });
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildCreateBookResponse(undefined, {
      premiseAnswers: {},
      style: { presetIds: [] },
    });

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
    expect(createBookWithIntakeMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Invalid or expired ID token."));

    const result = await buildCreateBookResponse("Bearer bad", {
      premiseAnswers: {},
      style: { presetIds: [] },
    });

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 400 when the request body is not the intake payload shape", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildCreateBookResponse("Bearer valid", { premiseAnswers: null });

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid-argument" });
    expect(createBookWithIntakeMock).not.toHaveBeenCalled();
  });
});

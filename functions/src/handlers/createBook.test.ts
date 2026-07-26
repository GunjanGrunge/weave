import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, createBookWithIntakeMock, runIntakeOpeningSuggestionMock } = vi.hoisted(
  () => ({
    verifyIdTokenMock: vi.fn(),
    createBookWithIntakeMock: vi.fn(),
    runIntakeOpeningSuggestionMock: vi.fn(),
  }),
);

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  createBookWithIntake: createBookWithIntakeMock,
}));

vi.mock("../pipelines/intake.js", () => ({
  runIntakeOpeningSuggestion: runIntakeOpeningSuggestionMock,
}));

import { buildCreateBookResponse } from "./createBook.js";
import { AuthError } from "../services/auth.js";

describe("buildCreateBookResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    createBookWithIntakeMock.mockReset();
    runIntakeOpeningSuggestionMock.mockReset();
  });

  it("returns 200 {bookId, openingSuggestion: 'ok', openings} for a valid token and request body", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-1" });
    runIntakeOpeningSuggestionMock.mockResolvedValue({
      status: "ok",
      openings: [{ text: "Open on the storm.", rationale: "Immediate stakes." }],
    });

    const result = await buildCreateBookResponse(
      "Bearer valid",
      {
        premiseAnswers: { whatToWrite: "A heist" },
        style: { presetIds: ["sparse-cinematic"] },
      },
      "fake-api-key",
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        bookId: "book-1",
        openingSuggestion: "ok",
        openings: [{ text: "Open on the storm.", rationale: "Immediate stakes." }],
      },
    });
    expect(createBookWithIntakeMock).toHaveBeenCalledWith("user-a", {
      premiseAnswers: { whatToWrite: "A heist" },
      style: { presetIds: ["sparse-cinematic"] },
    });
    expect(runIntakeOpeningSuggestionMock).toHaveBeenCalledWith("book-1", "fake-api-key");
  });

  it("still returns 200 {bookId, openingSuggestion: 'failed'} when the opening-suggestion pipeline fails", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-2" });
    runIntakeOpeningSuggestionMock.mockResolvedValue({ status: "failed", openings: [] });

    const result = await buildCreateBookResponse(
      "Bearer valid",
      {
        premiseAnswers: {},
        style: { presetIds: [] },
      },
      "fake-api-key",
    );

    expect(result).toEqual({
      statusCode: 200,
      body: { bookId: "book-2", openingSuggestion: "failed", openings: [] },
    });
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildCreateBookResponse(
      undefined,
      { premiseAnswers: {}, style: { presetIds: [] } },
      "fake-api-key",
    );

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
    expect(createBookWithIntakeMock).not.toHaveBeenCalled();
    expect(runIntakeOpeningSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid token", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Invalid or expired ID token."));

    const result = await buildCreateBookResponse(
      "Bearer bad",
      { premiseAnswers: {}, style: { presetIds: [] } },
      "fake-api-key",
    );

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
  });

  it("returns 400 when the request body is not the intake payload shape", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildCreateBookResponse(
      "Bearer valid",
      { premiseAnswers: null },
      "fake-api-key",
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid-argument" });
    expect(createBookWithIntakeMock).not.toHaveBeenCalled();
    expect(runIntakeOpeningSuggestionMock).not.toHaveBeenCalled();
  });
});

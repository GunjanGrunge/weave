import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const apiKeys = { openai: "fake-openai-key", gemini: "fake-gemini-key" };

describe("buildCreateBookResponse", () => {
  beforeEach(() => {
    vi.useRealTimers();
    verifyIdTokenMock.mockReset();
    createBookWithIntakeMock.mockReset();
    runIntakeOpeningSuggestionMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      apiKeys,
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
    expect(runIntakeOpeningSuggestionMock).toHaveBeenCalledWith("book-1", apiKeys);
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
      apiKeys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: { bookId: "book-2", openingSuggestion: "failed", openings: [] },
    });
  });

  it("still returns 200 {bookId, openingSuggestion: 'failed'} when the opening-suggestion pipeline times out", async () => {
    vi.useFakeTimers();
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-3" });
    runIntakeOpeningSuggestionMock.mockReturnValue(new Promise(() => undefined));

    const resultPromise = buildCreateBookResponse(
      "Bearer valid",
      {
        premiseAnswers: {},
        style: { presetIds: [] },
      },
      apiKeys,
      5,
    );

    await vi.advanceTimersByTimeAsync(5);

    await expect(resultPromise).resolves.toEqual({
      statusCode: 200,
      body: { bookId: "book-3", openingSuggestion: "failed", openings: [] },
    });
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildCreateBookResponse(
      undefined,
      { premiseAnswers: {}, style: { presetIds: [] } },
      apiKeys,
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
      apiKeys,
    );

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
  });

  it("passes idempotencyKey through to createBookWithIntake when provided", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    createBookWithIntakeMock.mockResolvedValue({ bookId: "book-4" });
    runIntakeOpeningSuggestionMock.mockResolvedValue({ status: "ok", openings: [] });

    await buildCreateBookResponse(
      "Bearer valid",
      {
        premiseAnswers: {},
        style: { presetIds: [] },
        idempotencyKey: "client-generated-uuid",
      },
      apiKeys,
    );

    expect(createBookWithIntakeMock).toHaveBeenCalledWith("user-a", {
      premiseAnswers: {},
      style: { presetIds: [] },
      idempotencyKey: "client-generated-uuid",
    });
  });

  it("returns 400 when the request body is not the intake payload shape", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildCreateBookResponse(
      "Bearer valid",
      { premiseAnswers: null },
      apiKeys,
    );

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid-argument" });
    expect(createBookWithIntakeMock).not.toHaveBeenCalled();
    expect(runIntakeOpeningSuggestionMock).not.toHaveBeenCalled();
  });
});

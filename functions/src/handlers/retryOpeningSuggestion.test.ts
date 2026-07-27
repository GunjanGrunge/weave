import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { verifyIdTokenMock, getBookMock, runIntakeOpeningSuggestionMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  runIntakeOpeningSuggestionMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
}));

vi.mock("../pipelines/intake.js", () => ({
  runIntakeOpeningSuggestion: runIntakeOpeningSuggestionMock,
}));

import { buildRetryOpeningSuggestionResponse } from "./retryOpeningSuggestion.js";
import { AuthError } from "../services/auth.js";

const apiKeys = { openai: "fake-openai-key", gemini: "fake-gemini-key" };

describe("buildRetryOpeningSuggestionResponse", () => {
  beforeEach(() => {
    vi.useRealTimers();
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    runIntakeOpeningSuggestionMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 {status, openings} for a valid token and an owned book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", title: "A heist", style: { presetIds: [] } });
    runIntakeOpeningSuggestionMock.mockResolvedValue({
      status: "ok",
      openings: [{ text: "Open on the storm.", rationale: "Immediate stakes." }],
    });

    const result = await buildRetryOpeningSuggestionResponse(
      "Bearer valid",
      { bookId: "book-1" },
      apiKeys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        status: "ok",
        openings: [{ text: "Open on the storm.", rationale: "Immediate stakes." }],
      },
    });
    expect(runIntakeOpeningSuggestionMock).toHaveBeenCalledWith("book-1", apiKeys);
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildRetryOpeningSuggestionResponse(
      undefined,
      { bookId: "book-1" },
      apiKeys,
    );

    expect(result.statusCode).toBe(401);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 200 {status: 'failed'} when the opening-suggestion retry times out", async () => {
    vi.useFakeTimers();
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a", title: "A heist", style: { presetIds: [] } });
    runIntakeOpeningSuggestionMock.mockReturnValue(new Promise(() => undefined));

    const resultPromise = buildRetryOpeningSuggestionResponse(
      "Bearer valid",
      { bookId: "book-1" },
      apiKeys,
      5,
    );

    await vi.advanceTimersByTimeAsync(5);

    await expect(resultPromise).resolves.toEqual({
      statusCode: 200,
      body: { status: "failed", openings: [] },
    });
  });

  it("returns 400 when bookId is missing from the body", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildRetryOpeningSuggestionResponse("Bearer valid", {}, apiKeys);

    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid-argument" });
  });

  it("returns 404 when the book does not exist", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildRetryOpeningSuggestionResponse(
      "Bearer valid",
      { bookId: "missing-book" },
      apiKeys,
    );

    expect(result.statusCode).toBe(404);
    expect(runIntakeOpeningSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller does not own the book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue({ uid: "user-a", title: "A heist", style: { presetIds: [] } });

    const result = await buildRetryOpeningSuggestionResponse(
      "Bearer valid",
      { bookId: "book-1" },
      apiKeys,
    );

    expect(result.statusCode).toBe(401);
    expect(runIntakeOpeningSuggestionMock).not.toHaveBeenCalled();
  });
});

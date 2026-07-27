import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getVisionDocumentMock,
  generateOpeningSuggestionsMock,
  upsertOpeningSuggestionMessageMock,
  claimOpeningSuggestionAttemptMock,
  resolveOpeningSuggestionAttemptMock,
} = vi.hoisted(() => ({
  getVisionDocumentMock: vi.fn(),
  generateOpeningSuggestionsMock: vi.fn(),
  upsertOpeningSuggestionMessageMock: vi.fn(),
  claimOpeningSuggestionAttemptMock: vi.fn(),
  resolveOpeningSuggestionAttemptMock: vi.fn(),
}));

vi.mock("../services/books.js", () => ({
  getVisionDocument: getVisionDocumentMock,
  upsertOpeningSuggestionMessage: upsertOpeningSuggestionMessageMock,
  claimOpeningSuggestionAttempt: claimOpeningSuggestionAttemptMock,
  resolveOpeningSuggestionAttempt: resolveOpeningSuggestionAttemptMock,
}));

vi.mock("../services/gemini.js", () => ({
  generateOpeningSuggestions: generateOpeningSuggestionsMock,
}));

import { runIntakeOpeningSuggestion } from "./intake.js";

const vision = {
  theme: "A heist novel",
  premise: "One last job goes sideways.",
  characterIntents: [],
  structureMap: [] as [],
  guidanceDial: "normal" as const,
  threads: [] as [],
};

const apiKeys = { openai: "fake-openai-key", gemini: "fake-gemini-key" };

describe("runIntakeOpeningSuggestion", () => {
  beforeEach(() => {
    getVisionDocumentMock.mockReset();
    generateOpeningSuggestionsMock.mockReset();
    upsertOpeningSuggestionMessageMock.mockReset();
    claimOpeningSuggestionAttemptMock.mockReset();
    resolveOpeningSuggestionAttemptMock.mockReset();
    claimOpeningSuggestionAttemptMock.mockResolvedValue({ shouldRun: true });
  });

  it("returns ok + openings and upserts the opening-suggestion structural_note message on success", async () => {
    getVisionDocumentMock.mockResolvedValue(vision);
    generateOpeningSuggestionsMock.mockResolvedValue({
      openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
    });

    const result = await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(result.status).toBe("ok");
    expect(result.openings).toEqual([{ text: "Open mid-heist.", rationale: "Immediate stakes." }]);
    expect(generateOpeningSuggestionsMock).toHaveBeenCalledWith("book-1", vision, apiKeys);
    expect(upsertOpeningSuggestionMessageMock).toHaveBeenCalledWith(
      "book-1",
      expect.stringContaining("Open mid-heist."),
    );
  });

  it("returns {status: 'failed'} without throwing when the vision document is missing", async () => {
    getVisionDocumentMock.mockResolvedValue(undefined);

    const result = await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(result).toEqual({ status: "failed", openings: [] });
    expect(generateOpeningSuggestionsMock).not.toHaveBeenCalled();
    expect(upsertOpeningSuggestionMessageMock).not.toHaveBeenCalled();
  });

  it("returns {status: 'failed'} without throwing when the Gemini call rejects", async () => {
    getVisionDocumentMock.mockResolvedValue(vision);
    generateOpeningSuggestionsMock.mockRejectedValue(new Error("Gemini unavailable"));

    const result = await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(result).toEqual({ status: "failed", openings: [] });
    expect(upsertOpeningSuggestionMessageMock).not.toHaveBeenCalled();
  });

  it("marks the attempt as failed and rethrows internally-caught so the outer catch reports {status: 'failed'} when Gemini rejects", async () => {
    getVisionDocumentMock.mockResolvedValue(vision);
    generateOpeningSuggestionsMock.mockRejectedValue(new Error("Gemini unavailable"));

    await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(resolveOpeningSuggestionAttemptMock).toHaveBeenCalledWith("book-1", "failed", []);
  });

  it("does not call Gemini again and returns the existing result when a suggestion already succeeded", async () => {
    claimOpeningSuggestionAttemptMock.mockResolvedValue({
      shouldRun: false,
      existingResult: {
        status: "ok",
        openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
      },
    });

    const result = await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(result).toEqual({
      status: "ok",
      openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
    });
    expect(generateOpeningSuggestionsMock).not.toHaveBeenCalled();
    expect(getVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("does not start a second concurrent attempt while one is already pending", async () => {
    claimOpeningSuggestionAttemptMock.mockResolvedValue({ shouldRun: false, existingResult: undefined });

    const result = await runIntakeOpeningSuggestion("book-1", apiKeys);

    expect(result).toEqual({ status: "failed", openings: [] });
    expect(generateOpeningSuggestionsMock).not.toHaveBeenCalled();
  });
});

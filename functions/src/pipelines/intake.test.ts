import { describe, it, expect, vi, beforeEach } from "vitest";

const { getVisionDocumentMock, generateOpeningSuggestionsMock, upsertOpeningSuggestionMessageMock } =
  vi.hoisted(() => ({
    getVisionDocumentMock: vi.fn(),
    generateOpeningSuggestionsMock: vi.fn(),
    upsertOpeningSuggestionMessageMock: vi.fn(),
  }));

vi.mock("../services/books.js", () => ({
  getVisionDocument: getVisionDocumentMock,
  upsertOpeningSuggestionMessage: upsertOpeningSuggestionMessageMock,
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

describe("runIntakeOpeningSuggestion", () => {
  beforeEach(() => {
    getVisionDocumentMock.mockReset();
    generateOpeningSuggestionsMock.mockReset();
    upsertOpeningSuggestionMessageMock.mockReset();
  });

  it("returns ok + openings and upserts the opening-suggestion structural_note message on success", async () => {
    getVisionDocumentMock.mockResolvedValue(vision);
    generateOpeningSuggestionsMock.mockResolvedValue({
      openings: [{ text: "Open mid-heist.", rationale: "Immediate stakes." }],
    });

    const result = await runIntakeOpeningSuggestion("book-1", "fake-key");

    expect(result.status).toBe("ok");
    expect(result.openings).toEqual([{ text: "Open mid-heist.", rationale: "Immediate stakes." }]);
    expect(generateOpeningSuggestionsMock).toHaveBeenCalledWith("book-1", vision, "fake-key");
    expect(upsertOpeningSuggestionMessageMock).toHaveBeenCalledWith(
      "book-1",
      expect.stringContaining("Open mid-heist."),
    );
  });

  it("returns {status: 'failed'} without throwing when the vision document is missing", async () => {
    getVisionDocumentMock.mockResolvedValue(undefined);

    const result = await runIntakeOpeningSuggestion("book-1", "fake-key");

    expect(result).toEqual({ status: "failed", openings: [] });
    expect(generateOpeningSuggestionsMock).not.toHaveBeenCalled();
    expect(upsertOpeningSuggestionMessageMock).not.toHaveBeenCalled();
  });

  it("returns {status: 'failed'} without throwing when the Gemini call rejects", async () => {
    getVisionDocumentMock.mockResolvedValue(vision);
    generateOpeningSuggestionsMock.mockRejectedValue(new Error("Gemini unavailable"));

    const result = await runIntakeOpeningSuggestion("book-1", "fake-key");

    expect(result).toEqual({ status: "failed", openings: [] });
    expect(upsertOpeningSuggestionMessageMock).not.toHaveBeenCalled();
  });
});

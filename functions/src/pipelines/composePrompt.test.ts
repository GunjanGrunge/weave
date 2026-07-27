import { describe, it, expect, vi, beforeEach } from "vitest";

const { getBookMock, getVisionDocumentMock } = vi.hoisted(() => ({
  getBookMock: vi.fn(),
  getVisionDocumentMock: vi.fn(),
}));

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  getVisionDocument: getVisionDocumentMock,
}));

import { composePrompt } from "./composePrompt.js";

const baseVision = {
  theme: "Heist",
  premise: "One last job.",
  characterIntents: ["Mara, the reluctant thief"],
  structureMap: [],
  guidanceDial: "normal" as const,
  threads: [] as Array<{
    surface: string;
    meaning: string;
    subtlety: "invisible" | "subtle" | "explicit";
    payoffIntent: string;
    status: "open" | "paid_off";
    appearances: string[];
  }>,
};

describe("composePrompt", () => {
  beforeEach(() => {
    getBookMock.mockReset();
    getVisionDocumentMock.mockReset();
  });

  it("resolves the style presets and custom instruction into one instruction string", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: ["sparse-cinematic"], customInstruction: "Keep it terse." },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: [] },
      "Mara breaks into the vault.",
    );

    expect(result?.prompt).toContain("Lean scenes, crisp images");
    expect(result?.prompt).toContain("Keep it terse.");
    expect(result?.prompt).toContain("Mara breaks into the vault.");
  });

  it("includes open threads with subtlety-aware instructions and excludes paid-off threads", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: [] },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue({
      ...baseVision,
      threads: [
        {
          surface: "A leaking ceiling",
          meaning: "The family is secretly broke",
          subtlety: "invisible",
          payoffIntent: "Reveal at the climax",
          status: "open",
          appearances: [],
        },
        {
          surface: "An old grudge",
          meaning: "Already resolved",
          subtlety: "explicit",
          payoffIntent: "n/a",
          status: "paid_off",
          appearances: [],
        },
      ],
    });

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: [] },
      "A quiet evening at home.",
    );

    expect(result?.prompt).toContain("A leaking ceiling");
    expect(result?.prompt).toContain("never state or hint at its hidden meaning");
    expect(result?.prompt).not.toContain("An old grudge");
  });

  it("includes the active chapter's prior scenes verbatim", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: [] },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: ["Scene one text.", "Scene two text."] },
      "Continue the story.",
    );

    expect(result?.prompt).toContain("Scene one text.");
    expect(result?.prompt).toContain("Scene two text.");
  });

  it("returns undefined when the book or vision document does not exist", async () => {
    getBookMock.mockResolvedValue(undefined);
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt("missing-book", { chapterId: undefined, priorScenesText: [] }, "x");

    expect(result).toBeUndefined();
  });
});

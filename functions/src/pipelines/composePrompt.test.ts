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
      { mode: "free-text", description: "Mara breaks into the vault." },
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
      { mode: "free-text", description: "A quiet evening at home." },
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
      { mode: "free-text", description: "Continue the story." },
    );

    expect(result?.prompt).toContain("Scene one text.");
    expect(result?.prompt).toContain("Scene two text.");
  });

  it("returns undefined when the book or vision document does not exist", async () => {
    getBookMock.mockResolvedValue(undefined);
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "missing-book",
      { chapterId: undefined, priorScenesText: [] },
      { mode: "free-text", description: "x" },
    );

    expect(result).toBeUndefined();
  });

  it("includes only the supplied structured fields, omitting absent ones", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: [] },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: [] },
      { mode: "structured", fields: { mood: "tense" } },
    );

    expect(result?.prompt).toContain("Mood: tense");
    expect(result?.prompt).not.toContain("Scene goal:");
    expect(result?.prompt).not.toContain("POV/character:");
    expect(result?.prompt).not.toContain("Setting:");
  });

  it("ties the mood field to a directive that should produce recognizably tense prose", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: [] },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: [] },
      { mode: "structured", fields: { mood: "tense" } },
    );

    expect(result?.prompt).toContain("Write this scene with a tense emotional register throughout.");
  });

  it("includes all four structured fields when supplied, plus the shared style/vision sections", async () => {
    getBookMock.mockResolvedValue({
      uid: "user-a",
      title: "A Heist",
      style: { presetIds: ["sparse-cinematic"] },
      createdAt: "t",
    });
    getVisionDocumentMock.mockResolvedValue(baseVision);

    const result = await composePrompt(
      "book-1",
      { chapterId: "chapter-1", priorScenesText: [] },
      {
        mode: "structured",
        fields: {
          sceneGoal: "Escape the vault",
          mood: "tense",
          povCharacter: "Mara",
          setting: "Loading dock at 3am",
        },
      },
    );

    expect(result?.prompt).toContain("Scene goal: Escape the vault");
    expect(result?.prompt).toContain("Mood: tense");
    expect(result?.prompt).toContain("POV/character: Mara");
    expect(result?.prompt).toContain("Setting: Loading dock at 3am");
    expect(result?.prompt).toContain("Lean scenes, crisp images");
    expect(result?.prompt).toContain("Heist");
  });
});

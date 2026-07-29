import { describe, expect, it } from "vitest";

import {
  composeWritingProfileInstruction,
  getWritingProfileConfig,
  normalizeGenreProfile,
  normalizeVisionWritingProfiles,
  normalizeVoiceProfile,
  parseGenreProfile,
  WritingProfileValidationError,
} from "./writingProfiles.js";

describe("writing profiles", () => {
  it("loads a unique, complete catalog of version-controlled craft packs", () => {
    const config = getWritingProfileConfig();
    expect(config.genres.length).toBeGreaterThanOrEqual(16);
    expect(new Set(config.genres.map((genre) => genre.id)).size).toBe(config.genres.length);
    expect(config.genres).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "fantasy", label: "Fantasy" }),
        expect.objectContaining({ id: "mystery", label: "Mystery" }),
        expect.objectContaining({ id: "playwriting", label: "Playwriting" }),
      ]),
    );
  });

  it("normalizes legacy Vision documents to stable genre and voice defaults", () => {
    const vision = normalizeVisionWritingProfiles({
      theme: "Inheritance",
      premise: "A lost heir returns.",
      characterIntents: [],
      structureMap: [],
      guidanceDial: "normal",
      threads: [],
    });
    expect(vision.genreProfile).toEqual(normalizeGenreProfile(undefined));
    expect(vision.voiceProfile).toEqual(normalizeVoiceProfile(undefined));
  });

  it("rejects unknown, duplicate, or excessive secondary genres", () => {
    const base = {
      ...normalizeGenreProfile(undefined),
      primaryGenre: "fantasy",
    };
    expect(() =>
      parseGenreProfile({
        ...base,
        secondaryGenres: ["romance", "romance"],
      }),
    ).toThrow(WritingProfileValidationError);
    expect(() =>
      parseGenreProfile({
        ...base,
        secondaryGenres: ["romance", "mystery", "thriller"],
      }),
    ).toThrow(WritingProfileValidationError);
    expect(() =>
      parseGenreProfile({
        ...base,
        secondaryGenres: ["unknown"],
      }),
    ).toThrow(WritingProfileValidationError);
  });

  it("composes weighted hybrid craft rules and the persistent book voice", () => {
    const instruction = composeWritingProfileInstruction({
      theme: "Power",
      premise: "A mage and detective expose a royal conspiracy.",
      characterIntents: [],
      structureMap: [],
      guidanceDial: "normal",
      threads: [],
      genreProfile: {
        ...normalizeGenreProfile(undefined),
        primaryGenre: "fantasy",
        secondaryGenres: ["mystery", "romance"],
        subgenre: "Gaslamp fantasy",
        tones: ["intimate", "unsettling"],
      },
      voiceProfile: {
        ...normalizeVoiceProfile(undefined),
        pointOfView: "third-person-limited",
        tense: "past",
        customDirection: "Keep the diction elegant but concrete.",
      },
    });

    expect(instruction).toContain("Primary genre (60%): Fantasy");
    expect(instruction).toContain("Secondary 1 genre (25%): Mystery");
    expect(instruction).toContain("Secondary 2 genre (15%): Romance");
    expect(instruction).toContain("Blend all active genres through the same events");
    expect(instruction).toContain("Point of view: third-person-limited");
    expect(instruction).toContain("Keep the diction elegant but concrete.");
  });
});

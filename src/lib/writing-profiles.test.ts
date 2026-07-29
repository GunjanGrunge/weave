import { describe, expect, it } from "vitest";

import {
  DEFAULT_GENRE_PROFILE,
  DEFAULT_VOICE_PROFILE,
  parseGenreProfile,
  parseVoiceProfile,
  parseWritingProfileConfig,
} from "./writing-profiles";

describe("writing profile parsing", () => {
  it("parses the server catalog and canonical defaults", () => {
    expect(
      parseWritingProfileConfig({
        genres: [
          {
            id: "general-fiction",
            label: "General Fiction",
            description: "Flexible fiction.",
          },
          { id: "fantasy", label: "Fantasy", description: "Wonder and consequence." },
        ],
        defaults: {
          genreProfile: DEFAULT_GENRE_PROFILE,
          voiceProfile: DEFAULT_VOICE_PROFILE,
        },
      }),
    ).toMatchObject({
      genres: [expect.objectContaining({ id: "general-fiction" }), expect.any(Object)],
      defaults: {
        genreProfile: { primaryGenre: "general-fiction" },
        voiceProfile: { pointOfView: "unspecified" },
      },
    });
  });

  it("rejects malformed profile shapes instead of silently trusting API data", () => {
    expect(
      parseGenreProfile({ ...DEFAULT_GENRE_PROFILE, secondaryGenres: "romance" }),
    ).toBeUndefined();
    expect(
      parseVoiceProfile({ ...DEFAULT_VOICE_PROFILE, pointOfView: "camera-person" }),
    ).toBeUndefined();
    expect(
      parseWritingProfileConfig({
        genres: [
          { id: "fantasy", label: "Fantasy", description: "" },
          { id: "fantasy", label: "Duplicate", description: "" },
        ],
        defaults: {
          genreProfile: DEFAULT_GENRE_PROFILE,
          voiceProfile: DEFAULT_VOICE_PROFILE,
        },
      }),
    ).toBeUndefined();
  });
});

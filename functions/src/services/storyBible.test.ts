import { describe, expect, it } from "vitest";

import {
  buildCompactCharacterRoster,
  characterIdForName,
  legacyFactToCharacterProfile,
  materializeCharacterProfile,
  reconciledStoryBibleWork,
  resolveCharacterEvidenceKeys,
  storyBibleExtractionTaskId,
} from "./storyBible.js";
import type { CharacterProfile, StoryBibleMemorySource } from "../types/storyBible.js";

function source(
  id: string,
  character: StoryBibleMemorySource["characters"][number],
): StoryBibleMemorySource {
  return {
    id,
    chapterId: id.split(":")[0],
    sceneId: id.split(":")[1],
    chapterOrder: id === "chapter-1:scene-1" ? 0 : 1,
    sceneOrder: 0,
    textHash: `hash-${id}`,
    characters: [character],
    extractedAt: "now",
  };
}

const bellPresent = source("chapter-1:scene-1", {
  characterKey: "mr-bell",
  name: "Mr. Bell",
  aliases: ["Bell"],
  stableTraits: [{ field: "age", value: "72", excerpt: "Mr. Bell was seventy-two." }],
  currentState: [{ field: "occupation", value: "retired teacher", excerpt: "He had retired." }],
  timelineEvents: [],
  temporalContext: "present",
});

describe("Story Bible materialization", () => {
  it("keeps historical flashback evidence in the timeline without changing present age", () => {
    const flashback = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [{ field: "age", value: "19", excerpt: "At nineteen, Bell enlisted." }],
      currentState: [],
      timelineEvents: [
        {
          label: "Enlisted",
          description: "Bell enlisted at nineteen.",
          chronology: "historical",
          excerpt: "At nineteen, Bell enlisted.",
        },
      ],
      temporalContext: "historical",
    });

    const profile = materializeCharacterProfile("mr-bell", [bellPresent, flashback]);

    expect(profile.stableTraits.age).toBe("72");
    expect(profile.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Enlisted",
          chronology: "historical",
          source: expect.objectContaining({ sceneId: "scene-1" }),
        }),
      ]),
    );
  });

  it("keeps a locked author correction canonical and exposes conflicting evidence", () => {
    const existing: CharacterProfile = {
      id: "mr-bell",
      name: "Mr. Bell",
      aliases: ["Bell"],
      summary: "",
      stableTraits: { age: "72" },
      currentState: {},
      timeline: [],
      sources: [],
      conflicts: [],
      authorOverrides: { stableTraits: { age: "72" }, currentState: {} },
      lockedFields: ["stableTraits.age"],
      verification: "verified",
      migrationState: "native",
      archived: false,
      version: 4,
      updatedAt: "then",
    };
    const contradiction = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [{ field: "age", value: "35", excerpt: "Bell was thirty-five." }],
      currentState: [],
      timelineEvents: [],
      temporalContext: "present",
    });

    const profile = materializeCharacterProfile("mr-bell", [bellPresent, contradiction], existing);

    expect(profile.stableTraits.age).toBe("72");
    expect(profile.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "stableTraits.age",
          canonicalValue: "72",
          evidenceValue: "35",
        }),
      ]),
    );
    expect(profile.lockedFields).toContain("stableTraits.age");
  });

  it("normalizes extracted field keys and lock paths before applying overrides", () => {
    const existing: CharacterProfile = {
      ...materializeCharacterProfile("mr-bell", [bellPresent]),
      authorOverrides: {
        stableTraits: { " Eye Color ": "hazel" },
        currentState: {},
      },
      lockedFields: ["stableTraits. Eye Color "],
    };
    const evidence = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [
        { field: "eye   color", value: "blue", excerpt: "His eyes were blue." },
      ],
      currentState: [],
      timelineEvents: [],
      temporalContext: "present",
    });

    const profile = materializeCharacterProfile("mr-bell", [evidence], existing);

    expect(profile.stableTraits).toEqual({ "eye color": "hazel" });
    expect(profile.lockedFields).toEqual(["stableTraits.eye color"]);
    expect(profile.conflicts[0]).toMatchObject({
      field: "stableTraits.eye color",
      canonicalValue: "hazel",
      evidenceValue: "blue",
    });
  });

  it("does not promote ambiguous chronology into stable canonical traits", () => {
    const ambiguous = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [{ field: "age", value: "19", excerpt: "Perhaps he was nineteen." }],
      currentState: [],
      timelineEvents: [],
      temporalContext: "ambiguous",
    });

    expect(materializeCharacterProfile("mr-bell", [ambiguous]).stableTraits.age).toBeUndefined();
  });

  it("bounds timeline and roster growth", () => {
    const manyEvents = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [],
      currentState: [],
      timelineEvents: Array.from({ length: 150 }, (_, index) => ({
        label: `Event ${index}`,
        description: "x".repeat(500),
        chronology: "historical" as const,
        excerpt: "Evidence.",
      })),
      temporalContext: "historical",
    });
    const profile = materializeCharacterProfile("mr-bell", [manyEvents]);
    const roster = buildCompactCharacterRoster([profile], "current");

    expect(profile.timeline).toHaveLength(100);
    expect(roster.length).toBeLessThanOrEqual(32_000);
  });

  it("stops using evidence when its source manifest is removed", () => {
    const secondSource = source("chapter-2:scene-1", {
      characterKey: "mr-bell",
      name: "Mr. Bell",
      aliases: [],
      stableTraits: [],
      currentState: [
        {
          field: "location",
          value: "the north station",
          excerpt: "Bell waited at the north station.",
        },
      ],
      timelineEvents: [],
      temporalContext: "present",
    });

    const before = materializeCharacterProfile("mr-bell", [bellPresent, secondSource]);
    const after = materializeCharacterProfile("mr-bell", [bellPresent], before);

    expect(before.currentState.location).toBe("the north station");
    expect(after.currentState.location).toBeUndefined();
    expect(after.stableTraits.age).toBe("72");
    expect(after.sources).toHaveLength(1);
  });

  it("seeds legacy character facts without inventing structured traits", () => {
    const profile = legacyFactToCharacterProfile("legacy-1", {
      name: "Elena",
      description: "Elena is a retired cat burglar with a scar.",
    });

    expect(profile).toMatchObject({
      id: characterIdForName("Elena"),
      name: "Elena",
      summary: "Elena is a retired cat burglar with a scar.",
      stableTraits: {},
      currentState: {},
      verification: "unverified",
      migrationState: "legacy-fact",
    });
  });

  it("builds a compact roster from every active profile and surfaces stale memory", () => {
    const bell = materializeCharacterProfile("mr-bell", [bellPresent]);
    const elena = legacyFactToCharacterProfile("elena", {
      name: "Elena",
      description: "Elena is a retired cat burglar.",
    });

    const roster = buildCompactCharacterRoster([bell, elena], "stale");

    expect(roster).toContain("Mr. Bell");
    expect(roster).toContain("age=72");
    expect(roster).toContain("Elena");
    expect(roster).toContain("MEMORY STATUS: STALE");
  });

  it("resolves an extracted alias to the existing canonical character id", () => {
    const existing = {
      ...materializeCharacterProfile("mr-bell", [bellPresent]),
      id: characterIdForName("Mr. Bell"),
      aliases: ["Bell"],
    };
    const [resolved] = resolveCharacterEvidenceKeys(
      [
        {
          characterKey: characterIdForName("Bell"),
          name: "Bell",
          aliases: [],
          stableTraits: [],
          currentState: [],
          timelineEvents: [],
          temporalContext: "present",
        },
      ],
      [existing],
    );

    expect(resolved.characterKey).toBe(existing.id);
  });

  it("does not merge an ambiguous alias shared by multiple profiles", () => {
    const first = {
      ...materializeCharacterProfile("alex-one", [bellPresent]),
      id: "alex-one",
      name: "Alex North",
      aliases: ["Alex"],
    };
    const second = {
      ...materializeCharacterProfile("alex-two", [bellPresent]),
      id: "alex-two",
      name: "Alex Vale",
      aliases: ["Alex"],
    };
    const extracted = {
      characterKey: characterIdForName("Alex"),
      name: "Alex",
      aliases: [],
      stableTraits: [],
      currentState: [],
      timelineEvents: [],
      temporalContext: "present" as const,
    };

    expect(resolveCharacterEvidenceKeys([extracted], [first, second])[0].characterKey).toBe(
      extracted.characterKey,
    );
  });

  it("keys rebuild extraction claims to the scene text", () => {
    expect(storyBibleExtractionTaskId("chapter-1", "scene-1", "First version")).toBe(
      storyBibleExtractionTaskId("chapter-1", "scene-1", "First version"),
    );
    expect(storyBibleExtractionTaskId("chapter-1", "scene-1", "First version")).not.toBe(
      storyBibleExtractionTaskId("chapter-1", "scene-1", "Revised version"),
    );
    expect(
      storyBibleExtractionTaskId("chapter-1", "scene-1", "First version", "0:0"),
    ).not.toBe(storyBibleExtractionTaskId("chapter-1", "scene-1", "First version", "1:0"));
  });

  it("keeps a multi-scene rebuild incomplete until every exact source reconciles", () => {
    const first = reconciledStoryBibleWork({
      pendingSources: ["source-1", "source-2"],
      failedSources: [],
      priorState: "rebuild-required",
      manifestId: "source-1",
      sourcePresent: true,
      rebuildRequestId: "rebuild-1",
      activeRebuildRequestId: "rebuild-1",
    });
    expect(first).toEqual({
      pendingSources: ["source-2"],
      failedSources: [],
      state: "rebuild-required",
    });

    const second = reconciledStoryBibleWork({
      pendingSources: first.pendingSources,
      failedSources: first.failedSources,
      priorState: first.state,
      manifestId: "source-2",
      sourcePresent: true,
      rebuildRequestId: "rebuild-1",
      activeRebuildRequestId: "rebuild-1",
    });
    expect(second).toEqual({
      pendingSources: [],
      failedSources: [],
      state: "current",
    });
  });

  it("does not clear rebuild-required for an extraction from an obsolete rebuild", () => {
    expect(
      reconciledStoryBibleWork({
        pendingSources: ["source-1"],
        failedSources: [],
        priorState: "rebuild-required",
        manifestId: "source-1",
        sourcePresent: true,
        rebuildRequestId: "old-rebuild",
        activeRebuildRequestId: "active-rebuild",
      }),
    ).toMatchObject({
      pendingSources: ["source-1"],
      state: "rebuild-required",
    });
  });
});

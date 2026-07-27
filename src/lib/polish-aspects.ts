// Duplicated byte-for-byte in functions/src/config/polishAspects.ts. There is
// no shared workspace between the functions/ package and the frontend, and
// this list is small, stable, curated data — the same tradeoff Story 1.3
// made for style presets (functions/src/config/stylePresets.ts /
// src/lib/style-presets.ts), deferred there as acceptable rather than
// building shared-package tooling. If you edit one copy, edit the other.
export type PolishAspect = {
  id: string;
  label: string;
  description: string;
};

export const POLISH_ASPECTS: PolishAspect[] = [
  {
    id: "tighten-pacing",
    label: "Tighten pacing",
    description: "Cut redundant description and slow beats without losing plot content.",
  },
  {
    id: "raise-tension",
    label: "Raise tension",
    description: "Sharpen stakes and urgency so the scene reads with more pressure.",
  },
  {
    id: "fix-dialogue",
    label: "Fix dialogue",
    description: "Make dialogue sound more natural and distinct per character.",
  },
  {
    id: "clarify-prose",
    label: "Clarify prose",
    description: "Resolve confusing sentences and ambiguous references for a clearer read.",
  },
  {
    id: "deepen-emotion",
    label: "Deepen emotion",
    description: "Bring out the emotional interiority already implied by the draft.",
  },
];

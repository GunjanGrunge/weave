// Kept byte-identical with the frontend copy. The parity test fails if either
// catalog changes independently.
export const POLISH_ASPECTS = [
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
] as const;

export type PolishAspect = (typeof POLISH_ASPECTS)[number];
export type PolishAspectId = PolishAspect["id"];

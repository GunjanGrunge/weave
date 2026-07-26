export type StylePreset = {
  id: string;
  label: string;
  description: string;
};

export const DEFAULT_STYLE_PRESET_ID = "warm-character-driven";

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "sparse-cinematic",
    label: "Sparse & Cinematic",
    description: "Lean scenes, crisp images, and momentum built through visible action.",
  },
  {
    id: "lyrical-introspective",
    label: "Lyrical & Introspective",
    description: "Image-rich prose with close interiority and reflective emotional movement.",
  },
  {
    id: "fast-paced-thriller",
    label: "Fast-Paced Thriller",
    description: "Short beats, escalating pressure, and chapter turns built for urgency.",
  },
  {
    id: "warm-character-driven",
    label: "Warm & Character-Driven",
    description: "Human, intimate scenes led by relationships, voice, and emotional consequence.",
  },
  {
    id: "twisty-misdirection-heavy",
    label: "Twisty & Misdirection-Heavy",
    description: "Layered reveals, withheld context, and clues that reward close reading.",
  },
  {
    id: "mythic-expansive",
    label: "Mythic & Expansive",
    description: "A broader register with symbolic stakes, textured settings, and spacious pacing.",
  },
];

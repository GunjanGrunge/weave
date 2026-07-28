export type StylePreset = {
  id: string;
  label: string;
  description: string;
  active: boolean;
};

export type StyleConfig = {
  defaultPresetId: string;
  presets: StylePreset[];
};

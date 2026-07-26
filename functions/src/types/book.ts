export type Style = {
  presetIds: string[];
  customInstruction?: string;
};

export type Book = {
  uid: string;
  title: string;
  style: Style;
  createdAt: unknown;
};

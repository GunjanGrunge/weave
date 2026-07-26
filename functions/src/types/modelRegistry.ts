export type ModelRegistry = {
  generate: { model: string; fallback: string };
  openingSuggestion: { model: string; fallback: string };
  museNote: { model: string };
  chapterSummary: { model: string };
  entityExtraction: { model: string };
  embedding: { model: string; outputDimensionality: number };
};

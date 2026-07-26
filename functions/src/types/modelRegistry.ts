export type AIProvider = "openai" | "gemini";

export type TextModelConfig = {
  primary: { provider: AIProvider; model: string };
  fallback?: { provider: AIProvider; model: string };
};

export type ModelRegistry = {
  generate: TextModelConfig;
  openingSuggestion: TextModelConfig;
  museNote: TextModelConfig;
  chapterSummary: TextModelConfig;
  entityExtraction: TextModelConfig;
  embedding: { provider: "gemini"; model: string; outputDimensionality: number };
};

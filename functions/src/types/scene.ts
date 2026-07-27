export type Scene = {
  text: string;
  order: number;
  modelUsed: string;
  provider: "openai" | "gemini";
  createdAt: unknown;
};

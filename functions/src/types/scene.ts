export type Scene = {
  text: string;
  order: number;
  modelUsed: string;
  provider: "openai" | "gemini";
  sourceSessionId: string;
  createdAt: unknown;
};

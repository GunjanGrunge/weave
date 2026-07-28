export type ChatMessageType = "user" | "assistant_scene" | "structural_note" | "system";

export type ChatMessage = {
  id?: string;
  type: ChatMessageType;
  text: string;
  order: number;
  createdAt?: unknown;
  sessionId?: string;
  revision?: number;
  status?: "active" | "accepted";
  provider?: "openai" | "gemini";
  model?: string;
  previousAttempt?: {
    text: string;
    provider: "openai" | "gemini";
    model: string;
  };
  acceptedSceneId?: string;
};

export type ChatMessageType = "user" | "assistant_scene" | "structural_note" | "system";

export type ChatMessage = {
  type: ChatMessageType;
  text: string;
  order: number;
  createdAt: unknown;
};

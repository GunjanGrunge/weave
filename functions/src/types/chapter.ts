export type Chapter = {
  order: number;
  nextSceneOrder?: number;
  createdAt: unknown;
  summary?: string;       // written by summarizePreviousChapter trigger after next chapter is created
  summarizedAt?: unknown; // Firestore Timestamp
};

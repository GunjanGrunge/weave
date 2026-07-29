export type Chapter = {
  order: number;
  title?: string;
  nextSceneOrder?: number;
  createdAt: unknown;
  summary?: string;       // written by summarizePreviousChapter trigger after next chapter is created
  summarizedAt?: unknown; // Firestore Timestamp
};

export type SceneUsageTask = "generate" | "regenerate";
export type UsageTask =
  | "openingSuggestion"
  | "museConversation"
  | "entityExtraction"
  | "embedding"
  | "chapterSummary"
  | "museNote"
  | "manuscriptEdit"
  | "deepRevision"
  | SceneUsageTask;

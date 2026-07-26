export const currentBook = {
  id: "",
  title: "Story Platform",
  subtitle: "",
  genre: "",
  status: "Drafting" as const,
  wordCount: 0,
  wordGoal: 0,
  progress: 0,
  streak: 0,
  wordsToday: 0,
  dailyGoal: 0,
  lastEdited: "",
  cover: "",
};

export const books: (typeof currentBook)[] = [];

export type ChapterStatus = "Outline" | "Drafting" | "Revision" | "Done";

export const chapters: Array<{
  id: string;
  number: number;
  title: string;
  status: ChapterStatus;
  wordCount: number;
  target: number;
  pov: string;
  summary: string;
}> = [];

export const characters: Array<{
  id: string;
  name: string;
  role: string;
  arc: string;
  traits: string[];
  color: string;
  initials: string;
}> = [];

export const relationships: Array<{ from: string; to: string; label: string }> = [];

export const locations: Array<{ id: string; name: string; kind: string; note: string }> = [];

export const organizations: Array<{
  id: string;
  name: string;
  motto: string;
  members: number;
}> = [];

export const loreEntries: Array<{ id: string; title: string; body: string }> = [];

export const timelineEvents: Array<{
  id: string;
  year: string;
  chapter: number;
  title: string;
}> = [];

export const consistencyIssues: Array<{
  id: string;
  kind: "Character" | "Timeline" | "Plot";
  severity: "high" | "med" | "low";
  chapter: number;
  title: string;
  detail: string;
}> = [];

export const refactorImpact = {
  from: "",
  to: "",
  chaptersAffected: 0,
  conflictRisks: 0,
  estimatedRewrite: 0,
  affectedChapters: [] as Array<{
    chapter: number;
    note: string;
    status: "auto" | "review" | "active";
  }>,
  diff: {
    chapter: 0,
    page: 0,
    before: "",
    after: "",
    highlights: [] as string[],
  },
  versions: [] as Array<{ id: string; label: string; date: string; note: string }>,
};

export const publishingChecklist: Array<{
  id: string;
  label: string;
  done: boolean;
  note: string;
}> = [];

export const aiActions = [
  "Rewrite",
  "Improve",
  "Expand",
  "Shorten",
  "Change Style",
  "Continue Writing",
  "Find Plot Holes",
  "Generate Ideas",
  "Explain Feedback",
] as const;

export const researchThreads: Array<{ id: string; q: string; a: string; sources: number }> = [];

export const notifications: Array<{ id: string; label: string; time: string }> = [];

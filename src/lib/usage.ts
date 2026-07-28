import {
  collection,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { firestore } from "./firebase";

export type UsageSummary = {
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function summarizeUsageDocuments(documents: unknown[]): UsageSummary {
  return documents.reduce<UsageSummary>(
    (summary, document) => {
      const usage =
        typeof document === "object" && document !== null
          ? (document as { inputTokens?: unknown; outputTokens?: unknown })
          : {};
      return {
        callCount: summary.callCount + 1,
        inputTokens: summary.inputTokens + tokenCount(usage.inputTokens),
        outputTokens: summary.outputTokens + tokenCount(usage.outputTokens),
        totalTokens:
          summary.totalTokens + tokenCount(usage.inputTokens) + tokenCount(usage.outputTokens),
      };
    },
    { callCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

export function subscribeBookUsage(
  bookId: string,
  onChange: (summary: UsageSummary) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const usageCollection = collection(firestore, "books", bookId, "usage");
  return onSnapshot(
    usageCollection,
    (snapshot: QuerySnapshot<DocumentData>) => {
      onChange(summarizeUsageDocuments(snapshot.docs.map((document) => document.data())));
    },
    onError,
  );
}

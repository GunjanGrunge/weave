import { beforeEach, describe, expect, it, vi } from "vitest";

const records = new Map<string, Record<string, unknown>>();

function ref(path: string) {
  return {
    path,
    collection: (name: string) => collection(`${path}/${name}`),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      records.set(
        path,
        options?.merge ? { ...(records.get(path) ?? {}), ...data } : data,
      );
    },
  };
}

function collection(path: string) {
  return {
    doc: (id: string) => ref(`${path}/${id}`),
  };
}

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["app"]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "server-time"),
  },
  getFirestore: vi.fn(() => ({
    collection,
    runTransaction: async (
      callback: (transaction: {
        get: (document: { path: string }) => Promise<{
          exists: boolean;
          data: () => Record<string, unknown> | undefined;
        }>;
        create: (
          document: { path: string },
          data: Record<string, unknown>,
        ) => void;
      }) => Promise<boolean>,
    ) =>
      callback({
        get: async (document) => ({
          exists: records.has(document.path),
          data: () => records.get(document.path),
        }),
        create: (document, data) => {
          records.set(document.path, data);
        },
      }),
  })),
}));

import {
  claimAutomationTask,
  completeAutomationTask,
  failAutomationTask,
} from "./automation.js";

describe("automation task claims", () => {
  beforeEach(() => {
    records.clear();
  });

  it("allows only the first delivery to claim a task", async () => {
    await expect(claimAutomationTask("book-1", "muse-scene-1")).resolves.toBe(true);
    await expect(claimAutomationTask("book-1", "muse-scene-1")).resolves.toBe(false);
  });

  it("records terminal task state without removing the durable claim", async () => {
    await claimAutomationTask("book-1", "summary-chapter-1");
    await completeAutomationTask("book-1", "summary-chapter-1");

    expect(records.get("books/book-1/automation/summary-chapter-1")).toMatchObject({
      state: "completed",
      completedAt: "server-time",
    });
    await expect(claimAutomationTask("book-1", "summary-chapter-1")).resolves.toBe(false);
  });

  it("truncates stored failure reasons", async () => {
    await claimAutomationTask("book-1", "entities-scene-1");
    await failAutomationTask("book-1", "entities-scene-1", "x".repeat(700));

    expect(
      records.get("books/book-1/automation/entities-scene-1")?.failureReason,
    ).toHaveLength(500);
  });
});

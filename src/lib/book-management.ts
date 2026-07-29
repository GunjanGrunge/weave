import { authenticatedFetch } from "./api";

export type SnapshotSummary = {
  id: string;
  name: string;
  createdAt: string | null;
};

export type SnapshotSceneDiff = {
  sceneId: string;
  status: "unchanged" | "added" | "removed" | "changed";
};

export type SnapshotChapterDiff = {
  chapterId: string;
  title: string;
  status: "unchanged" | "added" | "removed" | "changed";
  scenes: SnapshotSceneDiff[];
};

type ApiErrorBody = {
  message?: unknown;
};

export class BookManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookManagementError";
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await authenticatedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new BookManagementError(
      typeof errorBody?.message === "string"
        ? errorBody.message
        : "The request could not be completed.",
    );
  }

  return (await response.json()) as T;
}

export async function saveSnapshot(bookId: string, name: string): Promise<string> {
  const result = await post<{ snapshotId: string }>("/saveSnapshot", { bookId, name });
  if (!result.snapshotId) {
    throw new BookManagementError("The server returned an invalid snapshot.");
  }
  return result.snapshotId;
}

export async function listSnapshots(bookId: string): Promise<SnapshotSummary[]> {
  const result = await post<{ snapshots: SnapshotSummary[] }>("/listSnapshots", { bookId });
  if (!Array.isArray(result.snapshots)) {
    throw new BookManagementError("The server returned an invalid snapshot list.");
  }
  return result.snapshots;
}

export async function compareSnapshot(
  bookId: string,
  snapshotId: string,
): Promise<SnapshotChapterDiff[]> {
  const result = await post<{ chapters: SnapshotChapterDiff[] }>("/compareSnapshot", {
    bookId,
    snapshotId,
  });
  if (!Array.isArray(result.chapters)) {
    throw new BookManagementError("The server returned an invalid comparison.");
  }
  return result.chapters;
}

export async function restoreSnapshot(bookId: string, snapshotId: string): Promise<void> {
  await post<{ status: "ok" }>("/restoreSnapshot", {
    bookId,
    snapshotId,
    confirmed: true,
  });
}

export async function exportBook(
  bookId: string,
  format: "markdown" | "plain-text",
): Promise<string> {
  const result = await post<{ downloadUrl: string }>("/exportBook", { bookId, format });
  if (!result.downloadUrl) {
    throw new BookManagementError("The server returned an invalid download link.");
  }
  return result.downloadUrl;
}

export async function deleteBook(bookId: string): Promise<void> {
  await post<{ status: "ok" }>("/deleteBook", {
    bookId,
    confirmation: "DELETE",
  });
}

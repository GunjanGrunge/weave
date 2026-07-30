import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  compareSnapshotMock,
  deleteBookMock,
  exportBookMock,
  listSnapshotsMock,
  restoreSnapshotMock,
  saveSnapshotMock,
} = vi.hoisted(() => ({
  compareSnapshotMock: vi.fn(),
  deleteBookMock: vi.fn(),
  exportBookMock: vi.fn(),
  listSnapshotsMock: vi.fn(),
  restoreSnapshotMock: vi.fn(),
  saveSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/book-management", () => ({
  compareSnapshot: compareSnapshotMock,
  deleteBook: deleteBookMock,
  exportBook: exportBookMock,
  listSnapshots: listSnapshotsMock,
  restoreSnapshot: restoreSnapshotMock,
  saveSnapshot: saveSnapshotMock,
}));

import { BookTools } from "./BookTools";

const snapshot = {
  id: "snapshot-1",
  name: "Before rewrite",
  createdAt: "2026-07-29T12:00:00.000Z",
};

describe("BookTools", () => {
  beforeEach(() => {
    sessionStorage.clear();
    compareSnapshotMock.mockReset().mockResolvedValue([
      {
        chapterId: "chapter-1",
        title: "Chapter 1",
        status: "changed",
        scenes: [{ sceneId: "scene-1", status: "changed" }],
      },
    ]);
    deleteBookMock.mockReset().mockResolvedValue(undefined);
    exportBookMock.mockReset().mockResolvedValue("https://example.com/book.md");
    listSnapshotsMock.mockReset().mockResolvedValue([snapshot]);
    restoreSnapshotMock.mockReset().mockResolvedValue(undefined);
    saveSnapshotMock.mockReset().mockResolvedValue("snapshot-2");
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("lists, saves, compares, and restores snapshots after typed confirmation", async () => {
    const onRestored = vi.fn();
    render(<BookTools bookId="book-1" onDeleted={vi.fn()} onRestored={onRestored} />);

    fireEvent.click(screen.getByRole("button", { name: /versions/i }));
    expect(await screen.findByRole("button", { name: /before rewrite/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/snapshot name/i), {
      target: { value: "After chapter two" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(saveSnapshotMock).toHaveBeenCalledWith("book-1", "After chapter two"),
    );

    fireEvent.click(screen.getByRole("button", { name: /before rewrite/i }));
    expect(await screen.findByText("1 changed scene(s)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    const confirmButton = screen.getByRole("button", { name: /restore version/i });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type restore to confirm/i), {
      target: { value: "RESTORE" },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(restoreSnapshotMock).toHaveBeenCalledWith("book-1", "snapshot-1"));
    expect(onRestored).toHaveBeenCalled();
  });

  it("exports Markdown from the actions menu", async () => {
    render(<BookTools bookId="book-1" onDeleted={vi.fn()} onRestored={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: /export and book actions/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: /export markdown/i }));

    await waitFor(() => expect(exportBookMock).toHaveBeenCalledWith("book-1", "markdown"));
    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/book.md",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("deletes only after DELETE is typed and reports completion to the route", async () => {
    const onDeleted = vi.fn();
    render(<BookTools bookId="book-1" onDeleted={onDeleted} onRestored={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /delete this book/i }));

    expect(screen.getByText(/all stored embeddings/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: /permanently delete/i });
    expect(deleteButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.click(deleteButton);

    await waitFor(() => expect(deleteBookMock).toHaveBeenCalledWith("book-1"));
    expect(onDeleted).toHaveBeenCalled();
    expect(sessionStorage.getItem("weave.bookDeletedNotice")).toMatch(/permanently deleted/i);
  });
});

import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  Check,
  Download,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DeleteBookButton } from "@/components/book/DeleteBookButton";
import {
  compareSnapshot,
  exportBook,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
  type SnapshotChapterDiff,
  type SnapshotSummary,
} from "@/lib/book-management";

type OperationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatSnapshotDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function BookTools({
  bookId,
  onDeleted,
  onRestored,
}: {
  bookId: string;
  onDeleted: () => void;
  onRestored: () => void;
}) {
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [snapshotName, setSnapshotName] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotSummary | null>(null);
  const [comparison, setComparison] = useState<SnapshotChapterDiff[] | null>(null);
  const [snapshotState, setSnapshotState] = useState<OperationState>({ status: "idle" });
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [exportState, setExportState] = useState<OperationState>({ status: "idle" });

  useEffect(() => {
    if (!snapshotsOpen) return;
    let cancelled = false;
    setSnapshotState({ status: "loading" });
    void listSnapshots(bookId)
      .then((result) => {
        if (cancelled) return;
        setSnapshots(result);
        setSnapshotState({ status: "idle" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSnapshotState({
            status: "error",
            message: errorMessage(error, "Could not load snapshots."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, snapshotsOpen]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("panel") === "versions") {
      setSnapshotsOpen(true);
    }
  }, [bookId]);

  function setSnapshotsVisibility(open: boolean) {
    setSnapshotsOpen(open);
    if (!open && new URLSearchParams(window.location.search).get("panel") === "versions") {
      const url = new URL(window.location.href);
      url.searchParams.delete("panel");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }

  async function createSnapshot() {
    const name = snapshotName.trim();
    if (!name || snapshotState.status === "loading") return;
    setSnapshotState({ status: "loading" });
    try {
      await saveSnapshot(bookId, name);
      const nextSnapshots = await listSnapshots(bookId);
      setSnapshots(nextSnapshots);
      setSnapshotName("");
      setSnapshotState({ status: "success", message: "Snapshot saved." });
    } catch (error) {
      setSnapshotState({
        status: "error",
        message: errorMessage(error, "Could not save the snapshot."),
      });
    }
  }

  async function loadComparison(snapshot: SnapshotSummary) {
    setSelectedSnapshot(snapshot);
    setComparison(null);
    setSnapshotState({ status: "loading" });
    try {
      setComparison(await compareSnapshot(bookId, snapshot.id));
      setSnapshotState({ status: "idle" });
    } catch (error) {
      setSnapshotState({
        status: "error",
        message: errorMessage(error, "Could not compare the snapshot."),
      });
    }
  }

  async function confirmRestore() {
    if (!selectedSnapshot || restoreConfirmation !== "RESTORE") return;
    setSnapshotState({ status: "loading" });
    try {
      await restoreSnapshot(bookId, selectedSnapshot.id);
      setRestoreOpen(false);
      setSnapshotsOpen(false);
      setRestoreConfirmation("");
      onRestored();
    } catch (error) {
      setRestoreOpen(false);
      setSnapshotState({
        status: "error",
        message: errorMessage(error, "Could not restore the snapshot."),
      });
    }
  }

  async function runExport(format: "markdown" | "plain-text") {
    if (exportState.status === "loading") return;
    setExportState({ status: "loading" });
    try {
      const downloadUrl = await exportBook(bookId, format);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      setExportState({ status: "success", message: "Download prepared." });
    } catch (error) {
      setExportState({
        status: "error",
        message: errorMessage(error, "Could not export this book."),
      });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={`/books/${encodeURIComponent(bookId)}/story-bible`}>
            <BookOpenCheck className="size-4" />
            Story Bible
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setSnapshotsOpen(true)}>
          <History className="size-4" />
          Versions
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Export and book actions"
            >
              {exportState.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => void runExport("markdown")}>
              <FileText /> Export Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void runExport("plain-text")}>
              <FileText /> Export plain text
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DeleteBookButton bookId={bookId} onDeleted={onDeleted} />
      </div>

      {exportState.status === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {exportState.message}
        </p>
      )}

      <Dialog open={snapshotsOpen} onOpenChange={setSnapshotsVisibility}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Book versions</DialogTitle>
            <DialogDescription>
              Save a named snapshot, compare it with the current manuscript, or restore it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
              aria-label="Snapshot name"
              placeholder="Before chapter rewrite"
              maxLength={120}
            />
            <Button
              type="button"
              onClick={() => void createSnapshot()}
              disabled={!snapshotName.trim() || snapshotState.status === "loading"}
            >
              {snapshotState.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </div>

          {snapshotState.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {snapshotState.message}
            </p>
          )}
          {snapshotState.status === "success" && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 text-accent" /> {snapshotState.message}
            </p>
          )}

          <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Saved versions</h3>
              {snapshotState.status === "loading" && snapshots.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading versions
                </p>
              )}
              {snapshotState.status !== "loading" && snapshots.length === 0 && (
                <p className="text-sm text-muted-foreground">No snapshots yet.</p>
              )}
              {snapshots.map((snapshot) => (
                <button
                  key={snapshot.id}
                  type="button"
                  onClick={() => void loadComparison(snapshot)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedSnapshot?.id === snapshot.id
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <span className="block text-sm font-medium">{snapshot.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatSnapshotDate(snapshot.createdAt)}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-40 rounded-md border border-border p-4">
              {!selectedSnapshot && (
                <p className="text-sm text-muted-foreground">
                  Select a version to compare it with the current manuscript.
                </p>
              )}
              {selectedSnapshot && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{selectedSnapshot.name}</p>
                      <p className="text-xs text-muted-foreground">Compared with current book</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setRestoreConfirmation("");
                        setSnapshotsOpen(false);
                        setRestoreOpen(true);
                      }}
                      disabled={snapshotState.status === "loading"}
                    >
                      <RotateCcw className="size-4" /> Restore
                    </Button>
                  </div>
                  {comparison && comparison.length === 0 && (
                    <p className="mt-4 text-sm text-muted-foreground">No chapter differences.</p>
                  )}
                  <div className="mt-4 space-y-2">
                    {comparison?.map((chapter) => (
                      <div key={chapter.chapterId} className="rounded-md bg-muted/50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{chapter.title}</span>
                          <span className="text-xs capitalize text-muted-foreground">
                            {chapter.status}
                          </span>
                        </div>
                        {chapter.scenes.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {chapter.scenes.filter((scene) => scene.status !== "unchanged").length}{" "}
                            changed scene(s)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoreOpen}
        onOpenChange={(open) => {
          setRestoreOpen(open);
          if (!open) setRestoreConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current manuscript state. Type RESTORE to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={restoreConfirmation}
            onChange={(event) => setRestoreConfirmation(event.target.value)}
            aria-label="Type RESTORE to confirm"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRestore();
              }}
              disabled={restoreConfirmation !== "RESTORE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <RotateCcw className="size-4" /> Restore version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

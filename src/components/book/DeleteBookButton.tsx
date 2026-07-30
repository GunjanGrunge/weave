import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { deleteBook } from "@/lib/book-management";
import { BOOK_DELETED_NOTICE, storeBookDeletedNotice } from "@/lib/book-deletion";

type DeleteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Could not delete this book.";
}

export function DeleteBookButton({
  bookId,
  bookTitle,
  onDeleted,
  compact = false,
}: {
  bookId: string;
  bookTitle?: string;
  onDeleted: (message: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<DeleteState>({ status: "idle" });
  const displayTitle = bookTitle?.trim() || "this book";

  async function confirmDelete() {
    if (confirmation !== "DELETE" || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      await deleteBook(bookId);
      storeBookDeletedNotice();
      setOpen(false);
      onDeleted(BOOK_DELETED_NOTICE);
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size="sm"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete ${displayTitle}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Delete
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setConfirmation("");
            setState({ status: "idle" });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {displayTitle} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The book will be completely erased from WEAVE.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              This deletes the manuscript, chapters, scenes, conversations, Vision, versions,
              generated files, usage history, extracted facts, and all stored embeddings.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor={`delete-book-${bookId}`} className="text-sm font-medium">
              Type DELETE to confirm
            </label>
            <Input
              id={`delete-book-${bookId}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-label="Type DELETE to confirm"
              autoComplete="off"
              disabled={state.status === "loading"}
            />
          </div>

          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={state.status === "loading"}>Keep book</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              disabled={confirmation !== "DELETE" || state.status === "loading"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {state.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

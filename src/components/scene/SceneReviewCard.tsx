import { useEffect, useRef, useState } from "react";
import { Check, Columns2, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptScene,
  regenerateScene,
  revertGeneratedScene,
  saveGeneratedScene,
  SceneConflictError,
  type ChatMessage,
  type SceneCandidate,
} from "@/lib/scene-api";

type SaveStatus = "Saved" | "Saving" | "Error";
type ActionKind = "regenerate" | "revert" | "accept";

function keyFor(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function fromMessage(message: ChatMessage): SceneCandidate {
  if (
    !message.id ||
    !message.sessionId ||
    typeof message.revision !== "number" ||
    !message.status ||
    !message.provider ||
    !message.model
  ) {
    throw new Error("SceneReviewCard requires an actionable assistant message.");
  }
  return {
    sessionId: message.sessionId,
    messageId: message.id,
    text: message.text,
    revision: message.revision,
    status: message.status,
    provider: message.provider,
    model: message.model,
    ...(message.previousAttempt ? { previousAttempt: message.previousAttempt } : {}),
    ...(message.acceptedSceneId ? { acceptedSceneId: message.acceptedSceneId } : {}),
  };
}

export function SceneReviewCard({ bookId, message }: { bookId: string; message: ChatMessage }) {
  const initial = fromMessage(message);
  const identity = `${bookId}:${initial.sessionId}`;
  const identityRef = useRef(identity);
  const candidateRef = useRef(initial);
  const desiredTextRef = useRef(initial.text);
  const savedTextRef = useRef(initial.text);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingActionRef = useRef<ActionKind | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateKeyRef = useRef<string | null>(null);
  const acceptKeyRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [candidate, setCandidate] = useState(initial);
  const [text, setText] = useState(initial.text);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("Saved");
  const [conflict, setConflict] = useState<SceneCandidate | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<ActionKind | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    const next = fromMessage(message);
    identityRef.current = identity;
    candidateRef.current = next;
    desiredTextRef.current = next.text;
    savedTextRef.current = next.text;
    savePromiseRef.current = null;
    regenerateKeyRef.current = null;
    acceptKeyRef.current = null;
    setCandidate(next);
    setText(next.text);
    setSaveStatus("Saved");
    setConflict(null);
    setPendingAction(null);
    pendingActionRef.current = null;
    setActionError(null);
    setCompareOpen(false);
  }, [identity, message]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text]);

  async function startSave(): Promise<boolean> {
    if (
      savePromiseRef.current ||
      conflict ||
      candidateRef.current.status === "accepted" ||
      desiredTextRef.current === savedTextRef.current
    ) {
      return savePromiseRef.current ?? true;
    }
    const requestIdentity = identityRef.current;
    const requestedText = desiredTextRef.current;
    const current = candidateRef.current;
    setSaveStatus("Saving");

    const work = saveGeneratedScene(bookId, { ...current, text: requestedText })
      .then(async (saved) => {
        if (identityRef.current !== requestIdentity) {
          return false;
        }
        candidateRef.current = saved;
        setCandidate(saved);
        savedTextRef.current = saved.text;
        setSaveStatus(desiredTextRef.current === saved.text ? "Saved" : "Saving");
        return true;
      })
      .catch((error: unknown) => {
        if (identityRef.current !== requestIdentity) {
          return false;
        }
        if (error instanceof SceneConflictError) {
          setConflict(error.canonical);
        }
        setSaveStatus("Error");
        return false;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });
    savePromiseRef.current = work;
    const succeeded = await work;
    if (
      succeeded &&
      !conflict &&
      desiredTextRef.current !== savedTextRef.current &&
      identityRef.current === requestIdentity
    ) {
      return startSave();
    }
    return succeeded;
  }

  async function flushSave(): Promise<boolean> {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    while (desiredTextRef.current !== savedTextRef.current) {
      const succeeded = savePromiseRef.current ? await savePromiseRef.current : await startSave();
      if (!succeeded || conflict) {
        return false;
      }
    }
    return true;
  }

  useEffect(() => {
    if (
      candidate.status === "accepted" ||
      conflict ||
      desiredTextRef.current === savedTextRef.current
    ) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void startSave();
    }, 650);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // startSave intentionally reads the latest refs; recreating the debounce
    // for its function identity would postpone saves on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, candidate.status, conflict]);

  function updateText(value: string) {
    desiredTextRef.current = value;
    setText(value);
    setSaveStatus("Saving");
    setActionError(null);
  }

  function applyCanonical(next: SceneCandidate) {
    candidateRef.current = next;
    desiredTextRef.current = next.text;
    savedTextRef.current = next.text;
    setCandidate(next);
    setText(next.text);
    setSaveStatus("Saved");
    setConflict(null);
  }

  async function runAction(kind: ActionKind) {
    if (pendingActionRef.current || conflict) {
      return;
    }
    pendingActionRef.current = kind;
    setPendingAction(kind);
    setActionError(null);
    const requestIdentity = identityRef.current;
    try {
      if (!(await flushSave())) {
        setActionError(kind);
        return;
      }
      const current = candidateRef.current;
      let next: SceneCandidate;
      if (kind === "regenerate") {
        regenerateKeyRef.current ??= keyFor("regen");
        next = await regenerateScene(bookId, current, regenerateKeyRef.current);
        regenerateKeyRef.current = null;
      } else if (kind === "revert") {
        next = await revertGeneratedScene(bookId, current);
      } else {
        acceptKeyRef.current ??= keyFor("accept");
        next = await acceptScene(bookId, current, acceptKeyRef.current);
      }
      if (identityRef.current !== requestIdentity) {
        return;
      }
      applyCanonical(next);
      if (kind === "revert") {
        setCompareOpen(false);
      }
    } catch (error) {
      if (identityRef.current !== requestIdentity) {
        return;
      }
      if (error instanceof SceneConflictError) {
        setConflict(error.canonical);
        setSaveStatus("Error");
      }
      setActionError(kind);
    } finally {
      if (identityRef.current === requestIdentity) {
        pendingActionRef.current = null;
        setPendingAction(null);
      }
    }
  }

  function reloadSavedVersion() {
    if (conflict) {
      applyCanonical(conflict);
    }
  }

  const locked = candidate.status === "accepted";
  const actionsDisabled = Boolean(pendingAction || conflict || saveStatus === "Error");

  if (locked) {
    return (
      <article className="w-full max-w-2xl rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase text-muted-foreground">Scene</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" aria-hidden="true" /> Accepted
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7">{candidate.text}</p>
      </article>
    );
  }

  return (
    <article className="w-full max-w-2xl rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase text-muted-foreground">Scene draft</span>
        <span
          role="status"
          className={`text-xs ${
            saveStatus === "Error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {saveStatus}
        </span>
      </div>

      <Textarea
        ref={textareaRef}
        aria-label="Generated scene"
        value={text}
        onChange={(event) => updateText(event.target.value)}
        className="min-h-56 resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-7 shadow-none focus-visible:ring-0"
      />

      {conflict && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-foreground">
            A newer saved version exists (revision {conflict.revision}). Your local prose is still
            visible.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={reloadSavedVersion}
          >
            Reload saved version
          </Button>
        </div>
      )}

      {saveStatus === "Error" && !conflict && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <p role="alert" className="text-destructive">
            Could not save this edit. Your prose is still here.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void startSave()}>
            Retry save
          </Button>
        </div>
      )}

      {actionError && !conflict && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p role="alert" className="text-destructive">
            {actionError === "regenerate"
              ? "Regeneration failed. Your current scene is unchanged."
              : actionError === "accept"
                ? "Acceptance failed. The scene is still a draft."
                : "Could not restore the prior attempt."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void runAction(actionError)}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void runAction("accept")}
          disabled={actionsDisabled}
        >
          {pendingAction === "accept" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void runAction("regenerate")}
          disabled={actionsDisabled}
        >
          {pendingAction === "regenerate" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Regenerate
        </Button>
        {candidate.previousAttempt && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCompareOpen(true)}
            disabled={Boolean(pendingAction)}
          >
            <Columns2 className="size-4" /> Compare
          </Button>
        )}
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compare scene attempts</DialogTitle>
            <DialogDescription>
              Review the current scene beside the immediately prior generation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-medium">Current</h3>
              <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm leading-6">
                {text}
              </p>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Prior attempt</h3>
              <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm leading-6">
                {candidate.previousAttempt?.text}
              </p>
            </section>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAction("revert")}
              disabled={Boolean(pendingAction)}
            >
              {pendingAction === "revert" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Restore prior attempt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

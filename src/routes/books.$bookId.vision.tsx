import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";

export const Route = createFileRoute("/books/$bookId/vision")({
  head: () => ({
    meta: [
      { title: "Book Vision - Story Platform" },
      { name: "description", content: "View and shape your book's author-intent layer." },
    ],
  }),
  component: VisionRoute,
});

type ThreadSubtlety = "invisible" | "subtle" | "explicit";
type ThreadStatus = "open" | "paid_off";

type NarrativeThread = {
  id?: string;
  surface: string;
  meaning: string;
  subtlety: ThreadSubtlety;
  payoffIntent: string;
  status: ThreadStatus;
  appearances: string[];
};

type StructureBeat = { beat: string; sceneRef: string };

type VisionDocument = {
  theme: string;
  premise: string;
  characterIntents: string[];
  structureMap: StructureBeat[];
  guidanceDial: "normal";
  threads: NarrativeThread[];
};

type BookSummary = {
  bookId: string;
  title: string;
  style: { presetIds: string[]; customInstruction?: string };
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; book: BookSummary; vision: VisionDocument }
  | { status: "error"; message: string };

function emptyThread(): NarrativeThread {
  return {
    surface: "",
    meaning: "",
    subtlety: "subtle",
    payoffIntent: "",
    status: "open",
    appearances: [],
  };
}

function VisionRoute() {
  const { bookId } = Route.useParams();
  return <VisionPage bookId={bookId} />;
}

export function VisionPage({ bookId }: { bookId: string }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [theme, setTheme] = useState("");
  const [premise, setPremise] = useState("");
  const [characterIntentText, setCharacterIntentText] = useState("");
  const [threads, setThreads] = useState<NarrativeThread[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadVision() {
      setLoadState({ status: "loading" });
      try {
        const response = await authenticatedFetch("/getVision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId }),
        });
        if (!response.ok) {
          if (cancelled) return;
          if (response.status === 401) {
            setLoadState({ status: "error", message: "You don't have access to this book." });
          } else if (response.status === 404) {
            setLoadState({ status: "error", message: "This book's Vision could not be found." });
          } else {
            setLoadState({ status: "error", message: "Could not load this book's Vision." });
          }
          return;
        }
        const result = (await response.json()) as { book: BookSummary; vision: VisionDocument };
        if (cancelled) return;

        setLoadState({ status: "ready", book: result.book, vision: result.vision });
        setTheme(result.vision.theme);
        setPremise(result.vision.premise);
        setCharacterIntentText(result.vision.characterIntents.join("\n"));
        setThreads(result.vision.threads);
        setSaveState("idle");
      } catch {
        if (!cancelled) {
          setLoadState({ status: "error", message: "Could not load this book's Vision." });
        }
      }
    }

    void loadVision();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const characterIntents = useMemo(
    () => characterIntentText.split("\n").map((line) => line.trim()).filter(Boolean),
    [characterIntentText],
  );

  function markDirty() {
    setSaveState((current) => (current === "saving" ? current : "dirty"));
  }

  function updateThread(index: number, patch: Partial<NarrativeThread>) {
    setThreads((current) =>
      current.map((thread, threadIndex) =>
        threadIndex === index ? { ...thread, ...patch } : thread,
      ),
    );
    markDirty();
  }

  function removeThread(index: number) {
    setThreads((current) => current.filter((_thread, threadIndex) => threadIndex !== index));
    markDirty();
  }

  async function saveVision() {
    setSaveState("saving");
    try {
      const response = await authenticatedFetch("/updateVision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          vision: {
            theme,
            premise,
            characterIntents,
            threads,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("Save failed.");
      }
      const result = (await response.json()) as { vision: VisionDocument };
      setTheme(result.vision.theme);
      setPremise(result.vision.premise);
      setCharacterIntentText(result.vision.characterIntents.join("\n"));
      setThreads(result.vision.threads);
      setLoadState((current) =>
        current.status === "ready" ? { ...current, vision: result.vision } : current,
      );
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  if (loadState.status === "loading") {
    return (
      <div className="grid min-h-full place-items-center bg-background">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading Vision
        </p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Back to books
        </Link>
        <div className="mt-6 rounded-md border border-border bg-card p-6">
          <h1 className="font-display text-3xl italic">Vision unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadState.message}</p>
        </div>
      </div>
    );
  }

  const { book, vision } = loadState;

  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-8 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <Link
            to="/books"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Back to books
          </Link>
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Book Vision
          </p>
          <h1 className="mt-1 font-display text-4xl italic">{book.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saveState === "dirty" && "Unsaved changes"}
            {saveState === "saving" && "Saving..."}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Could not save"}
          </span>
          <Button type="button" onClick={saveVision} disabled={saveState === "saving"}>
            {saveState === "saving" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saveState === "saved" ? (
              <Check className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            Save Vision
          </Button>
        </div>
      </header>

      <main className="grid gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-5">
          <div className="rounded-md border border-border bg-card p-5">
            <label htmlFor="vision-theme" className="text-sm font-medium">
              Theme / genre
            </label>
            <input
              id="vision-theme"
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value);
                markDirty();
              }}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="rounded-md border border-border bg-card p-5">
            <label htmlFor="vision-premise" className="text-sm font-medium">
              Premise
            </label>
            <textarea
              id="vision-premise"
              value={premise}
              onChange={(event) => {
                setPremise(event.target.value);
                markDirty();
              }}
              rows={5}
              className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="rounded-md border border-border bg-card p-5">
            <label htmlFor="vision-characters" className="text-sm font-medium">
              Character intents
            </label>
            <textarea
              id="vision-characters"
              value={characterIntentText}
              onChange={(event) => {
                setCharacterIntentText(event.target.value);
                markDirty();
              }}
              rows={4}
              className="mt-2 min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <section className="rounded-md border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium">Narrative Threads</h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setThreads((current) => [...current, emptyThread()]);
                  markDirty();
                }}
              >
                <Plus className="size-4" /> Add Thread
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {threads.length === 0 && (
                <p className="text-sm text-muted-foreground">No narrative threads yet.</p>
              )}
              {threads.map((thread, index) => (
                <div key={thread.id ?? index} className="rounded-md border border-border p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Surface detail
                      <input
                        aria-label={`Thread ${index + 1} surface detail`}
                        value={thread.surface}
                        onChange={(event) => updateThread(index, { surface: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Hidden meaning
                      <input
                        aria-label={`Thread ${index + 1} hidden meaning`}
                        value={thread.meaning}
                        onChange={(event) => updateThread(index, { meaning: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent"
                      />
                    </label>
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Subtlety
                      <select
                        aria-label={`Thread ${index + 1} subtlety`}
                        value={thread.subtlety}
                        onChange={(event) =>
                          updateThread(index, { subtlety: event.target.value as ThreadSubtlety })
                        }
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent"
                      >
                        <option value="invisible">Invisible</option>
                        <option value="subtle">Subtle</option>
                        <option value="explicit">Explicit</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Payoff intent
                      <input
                        aria-label={`Thread ${index + 1} payoff intent`}
                        value={thread.payoffIntent}
                        onChange={(event) =>
                          updateThread(index, { payoffIntent: event.target.value })
                        }
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Remove thread ${index + 1}`}
                      onClick={() => removeThread(index)}
                    >
                      <Trash2 className="size-4" /> Remove
                    </Button>
                    <Button
                      type="button"
                      variant={thread.status === "paid_off" ? "secondary" : "outline"}
                      onClick={() =>
                        updateThread(index, {
                          status: thread.status === "paid_off" ? "open" : "paid_off",
                        })
                      }
                    >
                      {thread.status === "paid_off" ? "Paid off" : "Mark paid off"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="text-sm font-medium">Structure Map</h2>
            <div className="mt-3 space-y-2" aria-label="Structure Map read-only">
              {vision.structureMap.length === 0 ? (
                <p className="text-sm text-muted-foreground">No structure beats recorded yet.</p>
              ) : (
                vision.structureMap.map((beat) => (
                  <div key={`${beat.beat}-${beat.sceneRef}`} className="rounded border border-border p-3">
                    <p className="text-sm font-medium">{beat.beat}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{beat.sceneRef}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="text-sm font-medium">Guidance Dial</h2>
            <p className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              normal
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

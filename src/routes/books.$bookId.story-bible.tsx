import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Clock3,
  Eye,
  FileText,
  Link2,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchStoryBible,
  rebuildStoryBible,
  saveStoryBibleCharacter,
  StoryBibleApiError,
  type StoryBibleCharacter,
  type StoryBibleResponse,
} from "@/lib/story-bible";

export const Route = createFileRoute("/books/$bookId/story-bible")({
  head: () => ({
    meta: [
      { title: "Story Bible - WEAVE" },
      {
        name: "description",
        content: "Review the canonical characters and continuity memory for this book.",
      },
    ],
  }),
  component: StoryBibleRoute,
});

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: StoryBibleResponse }
  | { status: "error"; message: string };

type FieldRow = { id: string; field: string; value: string };

function StoryBibleRoute() {
  const { bookId } = Route.useParams();
  return <StoryBiblePage bookId={bookId} />;
}

function rows(record: Record<string, string>): FieldRow[] {
  return Object.entries(record).map(([field, value], index) => ({
    id: `${field}-${index}`,
    field,
    value,
  }));
}

function recordFromRows(items: FieldRow[]): Record<string, string> {
  return Object.fromEntries(
    items
      .map((item) => [item.field.trim(), item.value.trim()] as const)
      .filter(([field, value]) => field && value),
  );
}

function CharacterFields({
  title,
  kind,
  items,
  lockedFields,
  onItemsChange,
  onLockChange,
}: {
  title: string;
  kind: "stableTraits" | "currentState";
  items: FieldRow[];
  lockedFields: string[];
  onItemsChange: (items: FieldRow[]) => void;
  onLockChange: (path: string, locked: boolean) => void;
}) {
  return (
    <section className="border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Locked values remain canonical when later prose conflicts.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onItemsChange([
              ...items,
              { id: `new-${Date.now()}-${items.length}`, field: "", value: "" },
            ])
          }
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No values recorded.</p>
        ) : null}
        {items.map((item, index) => {
          const field = item.field.trim();
          const path = `${kind}.${field}`;
          const locked = field ? lockedFields.includes(path) : false;
          return (
            <div
              key={item.id}
              className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_2.5rem_2.5rem]"
            >
              <Input
                aria-label={`${title} field ${index + 1}`}
                value={item.field}
                maxLength={80}
                placeholder="Field"
                onChange={(event) => {
                  const nextField = event.target.value;
                  const nextPath = `${kind}.${nextField.trim()}`;
                  if (locked && nextPath !== path) {
                    onLockChange(path, false);
                    if (nextField.trim()) onLockChange(nextPath, true);
                  }
                  const next = [...items];
                  next[index] = { ...item, field: nextField };
                  onItemsChange(next);
                }}
              />
              <Input
                aria-label={`${title} value ${index + 1}`}
                value={item.value}
                maxLength={500}
                placeholder="Canonical value"
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, value: event.target.value };
                  onItemsChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!item.field}
                aria-label={`${locked ? "Unlock" : "Lock"} ${item.field || `${title} field`}`}
                onClick={() => onLockChange(path, !locked)}
                title={
                  locked ? "Allow extraction to update this value" : "Keep this value canonical"
                }
              >
                {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                aria-label={`Remove ${item.field || `${title} field ${index + 1}`}`}
                onClick={() => {
                  if (locked) onLockChange(path, false);
                  onItemsChange(items.filter((candidate) => candidate.id !== item.id));
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CharacterEditor({
  bookId,
  character,
  onSaved,
}: {
  bookId: string;
  character: StoryBibleCharacter;
  onSaved: (character: StoryBibleCharacter) => void;
}) {
  const [name, setName] = useState(character.name);
  const [aliases, setAliases] = useState(character.aliases.join(", "));
  const [summary, setSummary] = useState(character.summary);
  const [stableTraits, setStableTraits] = useState(() => rows(character.stableTraits));
  const [currentState, setCurrentState] = useState(() => rows(character.currentState));
  const [lockedFields, setLockedFields] = useState(character.lockedFields);
  const [archived, setArchived] = useState(character.archived);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setName(character.name);
    setAliases(character.aliases.join(", "));
    setSummary(character.summary);
    setStableTraits(rows(character.stableTraits));
    setCurrentState(rows(character.currentState));
    setLockedFields(character.lockedFields);
    setArchived(character.archived);
    setSaveState("idle");
    setSaveMessage("");
  }, [character]);

  function setLock(path: string, locked: boolean) {
    setLockedFields((current) =>
      locked ? [...new Set([...current, path])] : current.filter((candidate) => candidate !== path),
    );
  }

  async function save() {
    if (!name.trim() || saveState === "saving") return;
    setSaveState("saving");
    setSaveMessage("");
    try {
      const saved = await saveStoryBibleCharacter(bookId, character.id, character.version, {
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        summary: summary.trim(),
        stableTraits: recordFromRows(stableTraits),
        currentState: recordFromRows(currentState),
        lockedFields,
        archived,
      });
      setSaveState("saved");
      setSaveMessage("Character memory saved.");
      onSaved(saved);
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not save this character.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-2xl font-semibold [overflow-wrap:anywhere]">
              {character.name}
            </h2>
            <Badge variant={character.verification === "verified" ? "default" : "secondary"}>
              {character.verification}
            </Badge>
            {character.migrationState === "legacy-fact" ? (
              <Badge variant="outline">Imported, needs review</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {character.version} · {character.sources.length} source scene(s)
          </p>
        </div>
        <Button type="button" onClick={() => void save()} disabled={saveState === "saving"}>
          {saveState === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save character
        </Button>
      </header>

      {saveState === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {saveMessage}
        </p>
      ) : null}
      {saveState === "saved" ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-accent" />
          {saveMessage}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Name
          <Input
            className="mt-2"
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          Aliases
          <Input
            className="mt-2"
            value={aliases}
            maxLength={1_000}
            placeholder="Comma-separated names"
            onChange={(event) => setAliases(event.target.value)}
          />
        </label>
      </section>

      <label className="block text-sm font-medium">
        Character summary
        <Textarea
          className="mt-2 min-h-28"
          value={summary}
          maxLength={2_000}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>

      <CharacterFields
        title="Stable traits"
        kind="stableTraits"
        items={stableTraits}
        lockedFields={lockedFields}
        onItemsChange={setStableTraits}
        onLockChange={setLock}
      />
      <CharacterFields
        title="Current state"
        kind="currentState"
        items={currentState}
        lockedFields={lockedFields}
        onItemsChange={setCurrentState}
        onLockChange={setLock}
      />

      {Object.keys(character.currentState).length > 0 ? (
        <p className="sr-only">{Object.values(character.currentState).join(", ")}</p>
      ) : null}

      {character.conflicts.length > 0 ? (
        <section className="border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" />
            Conflicting evidence
          </h3>
          <div className="mt-3 space-y-2">
            {character.conflicts.map((conflict, index) => (
              <div
                key={`${conflict.field}-${index}`}
                className="min-w-0 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm [overflow-wrap:anywhere]"
              >
                <p>
                  <strong>{conflict.field}</strong>: keeping “{conflict.canonicalValue}”; source
                  says “{conflict.evidenceValue}”.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {conflict.source.chapterId} · {conflict.source.sceneId}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 border-t border-border pt-5 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="size-4" />
            Timeline
          </h3>
          <div className="mt-3 space-y-3">
            {character.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">No timeline events recorded.</p>
            ) : (
              character.timeline.map((event) => (
                <div key={event.id} className="border-l-2 border-accent/50 pl-3">
                  <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                    {event.label}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {event.description}
                  </p>
                  <Badge variant="outline" className="mt-2">
                    {event.chronology}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="size-4" />
            Source scenes
          </h3>
          <div className="mt-3 space-y-3">
            {character.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Imported summary has no scene-level provenance yet.
              </p>
            ) : (
              character.sources.map((source, index) => (
                <div
                  key={`${source.chapterId}-${source.sceneId}-${index}`}
                  className="min-w-0 text-sm [overflow-wrap:anywhere]"
                >
                  <p className="break-words font-medium">
                    {source.chapterId} · {source.sceneId}
                  </p>
                  <p className="mt-1 line-clamp-3 text-muted-foreground">“{source.excerpt}”</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <label className="flex items-start gap-3 border-t border-border pt-5 text-sm">
        <Checkbox
          checked={archived}
          onCheckedChange={(checked) => setArchived(checked === true)}
          aria-label="Archive character"
        />
        <span>
          <strong>Archive character</strong>
          <span className="mt-1 block text-muted-foreground">
            Archived characters stay in history but are omitted from generation context.
          </span>
        </span>
      </label>
    </div>
  );
}

export function StoryBiblePage({ bookId }: { bookId: string }) {
  const currentBookIdRef = useRef(bookId);
  currentBookIdRef.current = bookId;
  const loadSequenceRef = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rebuildState, setRebuildState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "started"; sceneCount: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const load = useCallback(async () => {
    const requestedBookId = bookId;
    const sequence = ++loadSequenceRef.current;
    setLoadState({ status: "loading" });
    try {
      const data = await fetchStoryBible(requestedBookId);
      if (currentBookIdRef.current !== requestedBookId || loadSequenceRef.current !== sequence) {
        return;
      }
      setLoadState({ status: "ready", data });
      setSelectedId((current) =>
        current && data.characters.some((character) => character.id === current)
          ? current
          : (data.characters[0]?.id ?? null),
      );
    } catch (error) {
      if (currentBookIdRef.current !== requestedBookId || loadSequenceRef.current !== sequence) {
        return;
      }
      const message =
        error instanceof StoryBibleApiError && error.status === 401
          ? "You don't have access to this book."
          : error instanceof Error
            ? error.message
            : "Could not load the Story Bible.";
      setLoadState({ status: "error", message });
    }
  }, [bookId]);

  useEffect(() => {
    setSelectedId(null);
    setRebuildState({ status: "idle" });
    void load();
  }, [load]);

  const selected = useMemo(
    () =>
      loadState.status === "ready"
        ? loadState.data.characters.find((character) => character.id === selectedId)
        : undefined,
    [loadState, selectedId],
  );

  async function startRebuild() {
    if (rebuildState.status === "loading") return;
    const requestedBookId = bookId;
    setRebuildState({ status: "loading" });
    try {
      const result = await rebuildStoryBible(requestedBookId);
      if (currentBookIdRef.current !== requestedBookId) return;
      setRebuildState({ status: "started", sceneCount: result.sceneCount });
    } catch (error) {
      if (currentBookIdRef.current !== requestedBookId) return;
      setRebuildState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not start building memory from this manuscript.",
      });
    }
  }

  if (loadState.status === "loading") {
    return (
      <div className="grid min-h-full place-items-center bg-background">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading Story Bible
        </p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back to books
        </Link>
        <div className="mt-6 border-y border-border py-10">
          <h1 className="text-2xl font-semibold">Story Bible unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadState.message}</p>
          <Button type="button" variant="outline" className="mt-5" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { data } = loadState;
  const characters = data.characters;
  const needsRebuild = data.memoryState === "stale" || data.memoryState === "rebuild-required";

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-5 py-6 sm:px-8">
          <div>
            <Link
              to="/books"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Back to books
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Story Bible
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{data.book.title}</h1>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Book workspace">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/books/$bookId/chat" params={{ bookId }}>
                <MessageSquareText className="size-4" />
                Chat
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/books/$bookId/manuscript" params={{ bookId }}>
                <BookOpen className="size-4" />
                Manuscript
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/books/$bookId/vision" params={{ bookId }}>
                <Eye className="size-4" />
                Vision
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {needsRebuild ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-8">
            <div className="flex min-w-0 gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="min-w-0 break-words [overflow-wrap:anywhere]">
                <strong>Memory needs attention.</strong> Imported or recently changed evidence is
                marked for review. Existing canonical values remain available to generation.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {rebuildState.status === "started" ? (
                <span role="status" className="text-xs text-muted-foreground">
                  Rebuild started for {rebuildState.sceneCount} scene
                  {rebuildState.sceneCount === 1 ? "" : "s"}.
                </span>
              ) : null}
              {rebuildState.status === "error" ? (
                <span role="alert" className="max-w-72 text-xs text-destructive">
                  {rebuildState.message}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void startRebuild()}
                disabled={rebuildState.status === "loading" || rebuildState.status === "started"}
              >
                {rebuildState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : rebuildState.status === "started" ? (
                  <Check className="size-4" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {rebuildState.status === "started" ? "Rebuild started" : "Rebuild from manuscript"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {characters.length === 0 ? (
        <main className="mx-auto grid max-w-3xl place-items-center px-6 py-20 text-center">
          <div>
            <Users className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-5 text-xl font-semibold">No characters recorded yet</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Characters appear here after accepted manuscript scenes establish them. WEAVE will
              then carry their canonical details into future generations.
            </p>
            {rebuildState.status === "started" ? (
              <p role="status" className="mt-5 text-sm text-muted-foreground">
                Building memory from {rebuildState.sceneCount} existing scene
                {rebuildState.sceneCount === 1 ? "" : "s"}. Refresh shortly to review the profiles.
              </p>
            ) : (
              <Button
                type="button"
                className="mt-5"
                onClick={() => void startRebuild()}
                disabled={rebuildState.status === "loading"}
              >
                {rebuildState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Build from manuscript
              </Button>
            )}
            {rebuildState.status === "error" ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {rebuildState.message}
              </p>
            ) : null}
          </div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-0 px-5 py-6 sm:px-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="border-b border-border pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Characters
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => setSelectedId(character.id)}
                  className={`min-w-44 max-w-full border-l-2 px-3 py-3 text-left transition-colors lg:w-full ${
                    selectedId === character.id
                      ? "border-accent bg-accent/10"
                      : "border-transparent hover:border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="block min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                    {character.name}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {character.verification === "verified" ? (
                      <Check className="size-3" />
                    ) : (
                      <AlertTriangle className="size-3" />
                    )}
                    {character.verification}
                    {character.archived ? " · archived" : ""}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 pt-6 lg:pl-8 lg:pt-0">
            {selected ? (
              <CharacterEditor
                bookId={bookId}
                character={selected}
                onSaved={(saved) => {
                  setLoadState((current) =>
                    current.status === "ready"
                      ? {
                          status: "ready",
                          data: {
                            ...current.data,
                            characters: current.data.characters.map((character) =>
                              character.id === saved.id ? saved : character,
                            ),
                          },
                        }
                      : current,
                  );
                }}
              />
            ) : (
              <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
                <FileText className="size-5" />
                Select a character.
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

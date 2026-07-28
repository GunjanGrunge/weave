import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";

import { SceneReviewCard } from "@/components/scene/SceneReviewCard";
import { StyleControl } from "@/components/book/StyleControl";
import { UsageIndicator } from "@/components/book/UsageIndicator";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";
import { POLISH_ASPECTS } from "@/lib/polish-aspects";
import type { PolishAspectId } from "@/lib/polish-aspects";
import { parseChatMessages, parseGeneratedScene, type ChatMessage } from "@/lib/scene-api";

export const Route = createFileRoute("/books/$bookId/chat")({
  head: () => ({
    meta: [
      { title: "Book Chat - Story Platform" },
      {
        name: "description",
        content: "Write your book's next scene through a chat-first surface.",
      },
    ],
  }),
  component: ChatRoute,
});

type ChatMessageType = ChatMessage["type"];

type LoadState =
  | { status: "loading" }
  | { status: "ready"; messages: ChatMessage[] }
  | { status: "error"; message: string };

type GenerationState = { status: "idle" | "loading" } | { status: "error"; message: string };

type InputMode = "free-text" | "structured" | "polish";

// Mirrors the server's per-field cap (functions/src/handlers/generateScene.ts)
// so a paste can't trigger a server-side 400 the user has no way to see coming.
const MAX_STRUCTURED_FIELD_LENGTH = 500;
// Mirrors the server's draft cap (functions/src/handlers/generateScene.ts).
const MAX_DRAFT_LENGTH = 8_000;
const DRAFT_PREVIEW_LENGTH = 200;

type StructuredFields = {
  sceneGoal: string;
  mood: string;
  povCharacter: string;
  setting: string;
};

const STRUCTURED_FIELD_LABELS: Array<{ key: keyof StructuredFields; label: string }> = [
  { key: "sceneGoal", label: "Scene goal" },
  { key: "mood", label: "Mood" },
  { key: "povCharacter", label: "POV/character" },
  { key: "setting", label: "Setting" },
];

function summarizeStructuredFields(fields: StructuredFields): string {
  return STRUCTURED_FIELD_LABELS.filter(({ key }) => fields[key].trim())
    .map(({ key, label }) => `${label}: ${fields[key].trim()}.`)
    .join(" ");
}

function truncatePreview(value: string, maxCodePoints: number): string {
  const codePoints = Array.from(value);
  return codePoints.length > maxCodePoints
    ? `${codePoints.slice(0, maxCodePoints).join("")}…`
    : value;
}

function summarizePolishRequest(draftText: string, aspects: PolishAspectId[]): string {
  const labels = aspects
    .map((aspectId) => POLISH_ASPECTS.find((aspect) => aspect.id === aspectId)?.label)
    .filter((label): label is NonNullable<typeof label> => Boolean(label));
  const preview = truncatePreview(draftText, DRAFT_PREVIEW_LENGTH);
  return `Polish draft (${labels.join(", ")}): ${preview}`;
}

function ChatRoute() {
  const { bookId } = Route.useParams();
  return <ChatPage bookId={bookId} />;
}

function messageStyles(type: ChatMessageType): string {
  if (type === "user") {
    return "ml-auto border-accent bg-accent text-accent-foreground";
  }
  if (type === "structural_note") {
    return "border-dashed border-accent/60 bg-card italic text-foreground";
  }
  if (type === "system") {
    return "border-border bg-background text-muted-foreground";
  }
  return "border-border bg-card text-foreground";
}

export function ChatPage({ bookId }: { bookId: string }) {
  const activeBookIdRef = useRef(bookId);
  const routeVersionRef = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [description, setDescription] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("free-text");
  const [structuredFields, setStructuredFields] = useState<StructuredFields>({
    sceneGoal: "",
    mood: "",
    povCharacter: "",
    setting: "",
  });
  const [draftText, setDraftText] = useState("");
  const [selectedAspects, setSelectedAspects] = useState<PolishAspectId[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: "idle" });
  const generationRequestRef = useRef<{ key: string; inputSnapshot: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    activeBookIdRef.current = bookId;
    routeVersionRef.current += 1;
    setDescription("");
    setInputMode("free-text");
    setStructuredFields({ sceneGoal: "", mood: "", povCharacter: "", setting: "" });
    setDraftText("");
    setSelectedAspects([]);
    setValidationError(null);
    setGenerationState({ status: "idle" });
    generationRequestRef.current = null;

    async function loadMessages() {
      setLoadState({ status: "loading" });
      try {
        const response = await authenticatedFetch("/getMessages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId }),
        });
        if (!response.ok) {
          throw new Error("Could not load messages.");
        }
        const messages = parseChatMessages(await response.json());
        if (!messages) {
          throw new Error("Invalid messages response.");
        }
        if (!cancelled) {
          setLoadState({ status: "ready", messages });
        }
      } catch {
        if (!cancelled) {
          setLoadState({ status: "error", message: "Could not load this book's Chat." });
        }
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function submitScene() {
    if (generationState.status === "loading") {
      return;
    }

    const trimmedDescription = description.trim();
    const hasStructuredValue = STRUCTURED_FIELD_LABELS.some(({ key }) =>
      structuredFields[key].trim(),
    );
    const hasDraftText = draftText.trim().length > 0;

    let payload: Record<string, unknown>;
    let userMessageText: string;

    if (inputMode === "free-text") {
      if (!trimmedDescription) {
        setValidationError("Describe what happens in the scene before sending.");
        return;
      }
      payload = { bookId, mode: "free-text", description: trimmedDescription };
      userMessageText = trimmedDescription;
    } else if (inputMode === "structured") {
      if (!hasStructuredValue) {
        setValidationError("Fill in at least one detail before sending.");
        return;
      }
      payload = { bookId, mode: "structured", fields: structuredFields };
      userMessageText = summarizeStructuredFields(structuredFields);
    } else {
      if (!hasDraftText) {
        setValidationError("Paste your draft before sending.");
        return;
      }
      if (draftText.length > MAX_DRAFT_LENGTH) {
        setValidationError(`Drafts can be up to ${MAX_DRAFT_LENGTH.toLocaleString()} characters.`);
        return;
      }
      if (selectedAspects.length === 0) {
        setValidationError("Select at least one polish aspect before sending.");
        return;
      }
      payload = { bookId, mode: "polish", draftText, aspects: selectedAspects };
      userMessageText = summarizePolishRequest(draftText, selectedAspects);
    }

    setValidationError(null);
    setGenerationState({ status: "loading" });
    const requestBookId = bookId;
    const requestRouteVersion = routeVersionRef.current;
    const inputSnapshot = JSON.stringify(payload);
    if (generationRequestRef.current?.inputSnapshot !== inputSnapshot) {
      generationRequestRef.current = {
        key: `generate-${crypto.randomUUID()}`,
        inputSnapshot,
      };
    }
    payload.idempotencyKey = generationRequestRef.current.key;

    try {
      const response = await authenticatedFetch("/generateScene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Generation failed.");
      }
      const result = parseGeneratedScene(await response.json());
      if (!result) {
        throw new Error("Invalid generation response.");
      }
      if (
        activeBookIdRef.current !== requestBookId ||
        routeVersionRef.current !== requestRouteVersion
      ) {
        return;
      }

      setLoadState((current) => {
        const priorMessages = current.status === "ready" ? current.messages : [];
        const nextOrder = priorMessages.length;
        return {
          status: "ready",
          messages: [
            ...priorMessages,
            { type: "user", text: userMessageText, order: nextOrder },
            result.actionable
              ? {
                  id: result.messageId,
                  type: "assistant_scene",
                  text: result.text,
                  order: nextOrder + 1,
                  sessionId: result.sessionId,
                  revision: result.revision,
                  status: result.status,
                  provider: result.provider,
                  model: result.model,
                  ...(result.previousAttempt ? { previousAttempt: result.previousAttempt } : {}),
                }
              : { type: "assistant_scene", text: result.text, order: nextOrder + 1 },
          ],
        };
      });
      generationRequestRef.current = null;
      if (inputMode === "free-text") {
        setDescription("");
      } else if (inputMode === "structured") {
        setStructuredFields({ sceneGoal: "", mood: "", povCharacter: "", setting: "" });
      } else {
        setDraftText("");
        setSelectedAspects([]);
      }
      setGenerationState({ status: "idle" });
    } catch {
      if (
        activeBookIdRef.current !== requestBookId ||
        routeVersionRef.current !== requestRouteVersion
      ) {
        return;
      }
      setGenerationState({
        status: "error",
        message: "Couldn't generate a scene. Your details are still here.",
      });
    }
  }

  function retry() {
    void submitScene();
  }

  function toggleAspect(aspectId: PolishAspectId) {
    setSelectedAspects((current) =>
      current.includes(aspectId) ? current.filter((id) => id !== aspectId) : [...current, aspectId],
    );
  }

  function switchInputMode(mode: InputMode) {
    setInputMode(mode);
    setValidationError(null);
    setGenerationState({ status: "idle" });
  }

  function updateDraftText(value: string) {
    setDraftText(value);
    setValidationError(
      value.length > MAX_DRAFT_LENGTH
        ? `Drafts can be up to ${MAX_DRAFT_LENGTH.toLocaleString()} characters.`
        : null,
    );
  }

  if (loadState.status === "loading") {
    return (
      <div className="grid min-h-full place-items-center bg-background">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading Chat
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
          <h1 className="font-display text-3xl italic">Chat unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadState.message}</p>
        </div>
      </div>
    );
  }

  const { messages } = loadState;
  const isLoading = generationState.status === "loading";

  return (
    <div className="mx-auto flex h-full max-w-3xl animate-reveal flex-col px-6 py-8 lg:px-10">
      <Link
        to="/books"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to shelf
      </Link>

      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl italic">Book Chat</h1>
        <StyleControl bookId={bookId} />
      </div>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-2" data-testid="message-list">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No messages yet. Describe a scene to begin.
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={message.id ?? `${message.type}-${message.order}-${index}`}
            className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.type === "assistant_scene" && message.sessionId ? (
              <SceneReviewCard bookId={bookId} message={message} />
            ) : (
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-md border px-4 py-3 text-sm leading-relaxed ${messageStyles(message.type)}`}
              >
                {message.type !== "user" && (
                  <Sparkles className="mb-2 size-4 text-accent" aria-hidden="true" />
                )}
                {message.text}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Writing your scene…
          </p>
        )}
      </div>

      {validationError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {validationError}
        </p>
      )}

      {generationState.status === "error" && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="text-muted-foreground">{generationState.message}</p>
          <Button type="button" variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchInputMode("free-text")}
            aria-pressed={inputMode === "free-text"}
            disabled={isLoading}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              inputMode === "free-text"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card hover:border-accent/50"
            }`}
          >
            Describe it
          </button>
          <button
            type="button"
            onClick={() => switchInputMode("structured")}
            aria-pressed={inputMode === "structured"}
            disabled={isLoading}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              inputMode === "structured"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card hover:border-accent/50"
            }`}
          >
            Quick details
          </button>
          <button
            type="button"
            onClick={() => switchInputMode("polish")}
            aria-pressed={inputMode === "polish"}
            disabled={isLoading}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              inputMode === "polish"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card hover:border-accent/50"
            }`}
          >
            Polish a draft
          </button>
        </div>
        <UsageIndicator bookId={bookId} />
      </div>

      {inputMode === "free-text" ? (
        <div className="mt-2 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 pl-4 focus-within:border-accent/40">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-label="Scene description"
            rows={2}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submitScene}
            disabled={isLoading}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      ) : inputMode === "structured" ? (
        <div className="mt-2 rounded-2xl border border-border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {STRUCTURED_FIELD_LABELS.map(({ key, label }) => (
              <label key={key} className="text-xs font-medium text-muted-foreground">
                {label}
                <input
                  value={structuredFields[key]}
                  onChange={(event) =>
                    setStructuredFields((current) => ({ ...current, [key]: event.target.value }))
                  }
                  aria-label={label}
                  disabled={isLoading}
                  maxLength={MAX_STRUCTURED_FIELD_LENGTH}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="button" onClick={submitScene} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-border bg-card p-3">
          <textarea
            value={draftText}
            onChange={(event) => updateDraftText(event.target.value)}
            aria-label="Draft text"
            rows={4}
            disabled={isLoading}
            placeholder="Paste your draft here…"
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
          <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
            {draftText.length.toLocaleString()} / {MAX_DRAFT_LENGTH.toLocaleString()}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {POLISH_ASPECTS.map((aspect) => {
              const selected = selectedAspects.includes(aspect.id);
              return (
                <button
                  key={aspect.id}
                  type="button"
                  onClick={() => toggleAspect(aspect.id)}
                  aria-pressed={selected}
                  aria-label={`${aspect.label}: ${aspect.description}`}
                  disabled={isLoading}
                  title={aspect.description}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  {aspect.label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="button" onClick={submitScene} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  fetchStyleConfig,
  MAX_CUSTOM_INSTRUCTION_LENGTH,
  type StyleConfig,
  type StylePreset,
} from "@/lib/styles";

export const Route = createFileRoute("/books/new")({
  head: () => ({
    meta: [
      { title: "New Book - WEAVE" },
      {
        name: "description",
        content: "Start a book through a guided writing conversation.",
      },
      { property: "og:title", content: "Begin a new book - WEAVE" },
      { property: "og:description", content: "A chat-first way to start your manuscript." },
    ],
  }),
  component: NewBook,
});

type PremiseKey = "whatToWrite" | "mainCharacter" | "roughPremise";
type ChatLine = { type: "system" | "user"; text: string };
type OpeningSuggestion = { text: string; rationale: string };
type OpeningSuggestionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; openings: OpeningSuggestion[] }
  | { status: "failed" };

const questions: Array<{ key: PremiseKey; prompt: string }> = [
  { key: "whatToWrite", prompt: "What do you want to write?" },
  { key: "mainCharacter", prompt: "Who is the main character?" },
  { key: "roughPremise", prompt: "What is the rough premise?" },
];

const initialMessages: ChatLine[] = [{ type: "system", text: questions[0].prompt }];

type IntakeDraft = {
  version: 1;
  answers: Partial<Record<PremiseKey, string>>;
  messages: ChatLine[];
  questionIndex: number;
  reply: string;
  selectedPresets: string[];
  customInstruction: string;
  idempotencyKey: string;
};

function intakeDraftKey(uid: string): string {
  return `story:intake:${uid}`;
}

function isChatLine(value: unknown): value is ChatLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<ChatLine>;
  return (line.type === "system" || line.type === "user") && typeof line.text === "string";
}

function readDraftAnswers(value: unknown): Partial<Record<PremiseKey, string>> | null {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const stored = value as Record<string, unknown>;
  const answers: Partial<Record<PremiseKey, string>> = {};
  for (const { key } of questions) {
    const answer = stored[key];
    if (answer !== undefined && typeof answer !== "string") return null;
    if (typeof answer === "string") answers[key] = answer;
  }
  return answers;
}

function loadIntakeDraft(uid: string): IntakeDraft | null {
  try {
    const raw = localStorage.getItem(intakeDraftKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntakeDraft>;
    const answers = readDraftAnswers(parsed.answers);
    if (
      parsed.version !== 1 ||
      !Number.isInteger(parsed.questionIndex) ||
      (parsed.questionIndex ?? -1) < 0 ||
      (parsed.questionIndex ?? questions.length + 1) > questions.length ||
      !Array.isArray(parsed.messages) ||
      parsed.messages.length === 0 ||
      !parsed.messages.every(isChatLine) ||
      answers === null ||
      typeof parsed.idempotencyKey !== "string" ||
      !parsed.idempotencyKey.trim()
    ) {
      localStorage.removeItem(intakeDraftKey(uid));
      return null;
    }
    return {
      version: 1,
      answers,
      messages: parsed.messages,
      questionIndex: parsed.questionIndex,
      reply: typeof parsed.reply === "string" ? parsed.reply : "",
      selectedPresets: Array.isArray(parsed.selectedPresets)
        ? parsed.selectedPresets
            .filter(
              (id, index, values): id is string =>
                typeof id === "string" && id.length > 0 && values.indexOf(id) === index,
            )
            .slice(0, 2)
        : [],
      customInstruction:
        typeof parsed.customInstruction === "string" ? parsed.customInstruction : "",
      idempotencyKey: parsed.idempotencyKey.trim(),
    };
  } catch {
    return null;
  }
}

function isOpeningSuggestionArray(value: unknown): value is OpeningSuggestion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as OpeningSuggestion).text === "string" &&
        typeof (item as OpeningSuggestion).rationale === "string",
    )
  );
}

function formatStyleChoice(
  presetIds: string[],
  customInstruction: string,
  presets: StylePreset[],
): string {
  const presetLabels = presetIds.map(
    (id) => presets.find((preset) => preset.id === id)?.label ?? id,
  );
  const base = presetLabels.length > 0 ? presetLabels.join(" + ") : "Default style";
  return customInstruction.trim() ? `${base}. ${customInstruction.trim()}` : base;
}

export default function NewBook() {
  const { user } = useAuth();
  const uid = user?.uid ?? "signed-out";
  const [initialDraft] = useState(() => loadIntakeDraft(uid));
  const [answers, setAnswers] = useState<Partial<Record<PremiseKey, string>>>(
    initialDraft?.answers ?? {},
  );
  const [messages, setMessages] = useState<ChatLine[]>(initialDraft?.messages ?? initialMessages);
  const [questionIndex, setQuestionIndex] = useState(initialDraft?.questionIndex ?? 0);
  const [reply, setReply] = useState(initialDraft?.reply ?? "");
  const [selectedPresets, setSelectedPresets] = useState<string[]>(
    initialDraft?.selectedPresets ?? [],
  );
  const [customInstruction, setCustomInstruction] = useState(initialDraft?.customInstruction ?? "");
  const [hasSavedDraft, setHasSavedDraft] = useState(initialDraft !== null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [openingSuggestion, setOpeningSuggestion] = useState<OpeningSuggestionState>({
    status: "idle",
  });
  const [styleConfig, setStyleConfig] = useState<StyleConfig | null>(null);
  const [styleConfigError, setStyleConfigError] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Stable for the lifetime of this intake attempt so a retry after a
  // dropped/unparseable response replays the same request instead of
  // creating a second book.
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => initialDraft?.idempotencyKey ?? crypto.randomUUID(),
  );

  const isStyleTurn = questionIndex >= questions.length;

  async function loadStyleConfig() {
    setStyleConfigError(false);
    try {
      const config = await fetchStyleConfig();
      setStyleConfig({ presets: config.presets, defaultPresetId: config.defaultPresetId });
      const activeIds = new Set(
        config.presets.filter((preset) => preset.active).map((preset) => preset.id),
      );
      setSelectedPresets((current) => current.filter((id) => activeIds.has(id)).slice(0, 2));
    } catch {
      setStyleConfigError(true);
    }
  }

  useEffect(() => {
    void loadStyleConfig();
  }, []);

  useEffect(() => {
    if (bookId) return;
    const hasProgress =
      questionIndex > 0 ||
      reply.trim().length > 0 ||
      selectedPresets.length > 0 ||
      customInstruction.trim().length > 0;
    try {
      if (!hasProgress) {
        localStorage.removeItem(intakeDraftKey(uid));
        setHasSavedDraft(false);
        return;
      }
      const draft: IntakeDraft = {
        version: 1,
        answers,
        messages,
        questionIndex,
        reply,
        selectedPresets,
        customInstruction,
        idempotencyKey,
      };
      localStorage.setItem(intakeDraftKey(uid), JSON.stringify(draft));
      setHasSavedDraft(true);
    } catch {
      // Intake still works when browser storage is unavailable.
    }
  }, [
    answers,
    bookId,
    customInstruction,
    idempotencyKey,
    messages,
    questionIndex,
    reply,
    selectedPresets,
    uid,
  ]);

  const premiseAnswers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(answers).filter(([, value]) => typeof value === "string" && value.trim()),
      ),
    [answers],
  );

  function advanceWithAnswer(text: string) {
    const currentQuestion = questions[questionIndex];
    if (!currentQuestion) return;

    const cleaned = text.trim();
    setAnswers((current) => ({ ...current, [currentQuestion.key]: cleaned }));
    setReply("");
    setMessages((current) => {
      const nextMessages = [...current, { type: "user" as const, text: cleaned || "(skipped)" }];
      const nextQuestion = questions[questionIndex + 1];
      return nextQuestion
        ? [...nextMessages, { type: "system" as const, text: nextQuestion.prompt }]
        : [...nextMessages, { type: "system" as const, text: "Choose a starting style." }];
    });
    setQuestionIndex((current) => current + 1);
  }

  function togglePreset(id: string) {
    setSelectedPresets((current) => {
      if (current.includes(id)) {
        return current.filter((presetId) => presetId !== id);
      }
      if (current.length >= 2) {
        setError("Choose up to two style presets.");
        return current;
      }
      setError(null);
      return [...current, id];
    });
  }

  async function createBook() {
    if (!styleConfig) {
      setError("Style options are still unavailable. Retry loading them first.");
      return;
    }
    if (customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH) {
      setError(
        `Custom style instructions can be up to ${MAX_CUSTOM_INSTRUCTION_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    // Only fall back to the default preset when style choice was skipped
    // entirely — typing a custom instruction with no preset selected is a
    // valid, distinct AC-1 choice, not a skip.
    const presetIds =
      selectedPresets.length === 0 && !customInstruction.trim()
        ? [styleConfig.defaultPresetId]
        : selectedPresets;
    const payload = {
      premiseAnswers,
      style: {
        presetIds,
        ...(customInstruction.trim() ? { customInstruction: customInstruction.trim() } : {}),
      },
      idempotencyKey,
    };

    try {
      const response = await authenticatedFetch("/createBook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Book creation failed.");
      }
      const result = (await response.json()) as Partial<{
        bookId: string;
        openingSuggestion: "ok" | "failed";
        openings: OpeningSuggestion[];
      }>;
      if (
        typeof result.bookId !== "string" ||
        !result.bookId.trim() ||
        (result.openingSuggestion !== "ok" && result.openingSuggestion !== "failed") ||
        !isOpeningSuggestionArray(result.openings)
      ) {
        throw new Error("Book creation returned an invalid response.");
      }
      setMessages((current) => [
        ...current,
        {
          type: "user",
          text: formatStyleChoice(presetIds, customInstruction, styleConfig.presets),
        },
      ]);
      try {
        localStorage.removeItem(intakeDraftKey(uid));
      } catch {
        // The persisted Firestore book is authoritative after creation.
      }
      setHasSavedDraft(false);
      setBookId(result.bookId.trim());
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      setOpeningSuggestion(
        result.openingSuggestion === "ok" && isOpeningSuggestionArray(result.openings)
          ? { status: "ok", openings: result.openings }
          : { status: "failed" },
      );
    } catch (_error) {
      setError("Could not create the book. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryOpeningSuggestion() {
    if (!bookId || openingSuggestion.status === "loading") return;
    setOpeningSuggestion({ status: "loading" });
    try {
      const response = await authenticatedFetch("/retryOpeningSuggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      if (!response.ok) {
        throw new Error("Retry failed.");
      }
      const result = (await response.json()) as {
        status: "ok" | "failed";
        openings: OpeningSuggestion[];
      };
      setOpeningSuggestion(
        result.status === "ok" && isOpeningSuggestionArray(result.openings)
          ? { status: "ok", openings: result.openings }
          : { status: "failed" },
      );
    } catch (_error) {
      setOpeningSuggestion({ status: "failed" });
    }
  }

  function discardDraft() {
    try {
      localStorage.removeItem(intakeDraftKey(uid));
    } catch {
      // State reset below is sufficient when storage is unavailable.
    }
    setAnswers({});
    setMessages(initialMessages);
    setQuestionIndex(0);
    setReply("");
    setSelectedPresets([]);
    setCustomInstruction("");
    setIdempotencyKey(crypto.randomUUID());
    setError(null);
    setHasSavedDraft(false);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl animate-reveal flex-col px-5 py-6 sm:px-8 lg:px-10">
      <Link
        to="/books"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to shelf
      </Link>

      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border bg-background">
        <div className="border-b border-border py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">New Book</p>
              <h1 className="mt-1 font-display text-3xl italic leading-tight">
                Start with a conversation
              </h1>
            </div>
            {hasSavedDraft && !bookId && (
              <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
                <RotateCcw className="size-4" />
                Discard intake
              </Button>
            )}
          </div>
          {hasSavedDraft && !bookId && (
            <p className="mt-2 text-xs text-muted-foreground">
              This unfinished intake is saved on this device.
            </p>
          )}
        </div>

        <div className="min-h-[320px] flex-1 space-y-4 overflow-y-auto py-6">
          {messages.map((message, index) => (
            <div
              key={`${message.type}-${index}`}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[82%] rounded-md border px-4 py-3 text-sm leading-relaxed ${
                  message.type === "user"
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {message.type === "system" && (
                  <Sparkles className="mb-2 size-4 text-accent" aria-hidden="true" />
                )}
                {message.text}
              </div>
            </div>
          ))}

          {bookId && (
            <div className="flex justify-start">
              <div className="max-w-[82%] rounded-md border border-accent bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
                <Sparkles className="mb-2 size-4 text-accent" aria-hidden="true" />
                {openingSuggestion.status === "loading" && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> The Muse is thinking of openings…
                  </p>
                )}
                {openingSuggestion.status === "ok" && (
                  <ol className="list-decimal space-y-2 pl-4">
                    {openingSuggestion.openings.map((opening, index) => (
                      <li key={index}>
                        <p>{opening.text}</p>
                        <p className="mt-1 text-xs italic text-muted-foreground">
                          {opening.rationale}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                {openingSuggestion.status === "failed" && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-muted-foreground">Couldn't get opening suggestions.</p>
                    <Button type="button" variant="outline" onClick={retryOpeningSuggestion}>
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {bookId ? (
          <div className="border-t border-border py-4">
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() =>
                  bookId && navigate({ to: "/books/$bookId/chat", params: { bookId } })
                }
              >
                Continue to my book
              </Button>
            </div>
          </div>
        ) : !isStyleTurn ? (
          <div className="border-t border-border py-4">
            <div className="flex items-end gap-2">
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                aria-label="Reply"
                rows={3}
                className="min-h-24 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" onClick={() => advanceWithAnswer("")}>
                  Skip
                </Button>
                <Button type="button" onClick={() => advanceWithAnswer(reply)}>
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-border py-4">
            {!styleConfig && !styleConfigError && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading style options
              </p>
            )}
            {styleConfigError && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3">
                <p className="text-sm text-muted-foreground">Could not load style options.</p>
                <Button type="button" variant="outline" onClick={() => void loadStyleConfig()}>
                  Retry
                </Button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {styleConfig?.presets
                .filter((preset) => preset.active)
                .map((preset) => {
                  const selected = selectedPresets.includes(preset.id);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => togglePreset(preset.id)}
                      aria-pressed={selected}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-card hover:border-accent/50"
                      }`}
                    >
                      <span className="block text-sm font-medium">{preset.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}
            </div>
            <textarea
              value={customInstruction}
              onChange={(event) => setCustomInstruction(event.target.value)}
              aria-label="Custom style instruction"
              placeholder="Optional custom style instruction"
              maxLength={MAX_CUSTOM_INSTRUCTION_LENGTH}
              rows={3}
              className="mt-3 min-h-20 w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
              {customInstruction.length.toLocaleString()} /{" "}
              {MAX_CUSTOM_INSTRUCTION_LENGTH.toLocaleString()}
            </p>
            {customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Custom style instructions can be up to{" "}
                {MAX_CUSTOM_INSTRUCTION_LENGTH.toLocaleString()} characters. Shorten the restored
                draft before creating the book.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                onClick={createBook}
                disabled={
                  submitting ||
                  !styleConfig ||
                  customInstruction.length > MAX_CUSTOM_INSTRUCTION_LENGTH
                }
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Create Book
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

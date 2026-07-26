import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";
import { DEFAULT_STYLE_PRESET_ID, STYLE_PRESETS } from "@/lib/style-presets";

export const Route = createFileRoute("/books/new")({
  head: () => ({
    meta: [
      { title: "New Book - Story Platform" },
      {
        name: "description",
        content: "Start a book through a guided writing conversation.",
      },
      { property: "og:title", content: "Begin a new book - Story Platform" },
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

function formatStyleChoice(presetIds: string[], customInstruction: string): string {
  const presetLabels = presetIds.map(
    (id) => STYLE_PRESETS.find((preset) => preset.id === id)?.label ?? id,
  );
  const base = presetLabels.length > 0 ? presetLabels.join(" + ") : "Default style";
  return customInstruction.trim() ? `${base}. ${customInstruction.trim()}` : base;
}

export default function NewBook() {
  const [answers, setAnswers] = useState<Partial<Record<PremiseKey, string>>>({});
  const [messages, setMessages] = useState<ChatLine[]>(initialMessages);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reply, setReply] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [customInstruction, setCustomInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const [openingSuggestion, setOpeningSuggestion] = useState<OpeningSuggestionState>({
    status: "idle",
  });
  const navigate = useNavigate();

  const isStyleTurn = questionIndex >= questions.length;

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
      return [...current, id].slice(-2);
    });
  }

  async function createBook() {
    setSubmitting(true);
    setError(null);
    const presetIds = selectedPresets.length > 0 ? selectedPresets : [DEFAULT_STYLE_PRESET_ID];
    const payload = {
      premiseAnswers,
      style: {
        presetIds,
        ...(customInstruction.trim() ? { customInstruction: customInstruction.trim() } : {}),
      },
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
      const result = (await response.json()) as {
        bookId: string;
        openingSuggestion: "ok" | "failed";
        openings: OpeningSuggestion[];
      };
      setMessages((current) => [
        ...current,
        { type: "user", text: formatStyleChoice(presetIds, customInstruction) },
      ]);
      setBookId(result.bookId);
      setOpeningSuggestion(
        result.openingSuggestion === "ok"
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
    if (!bookId) return;
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
        result.status === "ok" ? { status: "ok", openings: result.openings } : { status: "failed" },
      );
    } catch (_error) {
      setOpeningSuggestion({ status: "failed" });
    }
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
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">New Book</p>
          <h1 className="mt-1 font-display text-3xl italic leading-tight">
            Start with a conversation
          </h1>
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
              <Button type="button" onClick={() => navigate({ to: "/books" })}>
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
            <div className="grid gap-3 sm:grid-cols-2">
              {STYLE_PRESETS.map((preset) => {
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
              rows={3}
              className="mt-3 min-h-20 w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={createBook} disabled={submitting}>
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

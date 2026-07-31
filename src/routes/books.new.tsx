import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";
import { fetchStyleConfig } from "@/lib/styles";
import { DEFAULT_GENRE_PROFILE, DEFAULT_VOICE_PROFILE } from "@/lib/writing-profiles";

export const Route = createFileRoute("/books/new")({
  head: () => ({
    meta: [
      { title: "Start a book - WEAVE" },
      {
        name: "description",
        content: "Begin a book with a conversation with the Muse.",
      },
    ],
  }),
  component: NewBook,
});

type StartState = "idle" | "opening";

const WELCOME =
  "Bring me a premise, a character, a mood, a fragment, or simply the kind of book you want to write. We will discover it together before drafting a single scene.";

function responseBookId(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { bookId?: unknown }).bookId === "string"
    ? (value as { bookId: string }).bookId
    : undefined;
}

export default function NewBook() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [state, setState] = useState<StartState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function startConversation() {
    const firstThought = message.trim();
    if (!firstThought || state === "opening") return;

    setState("opening");
    setError(null);
    try {
      const config = await fetchStyleConfig();
      const createResponse = await authenticatedFetch("/createBook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          premiseAnswers: { whatToWrite: firstThought },
          style: { presetIds: [config.defaultPresetId] },
          genreProfile: DEFAULT_GENRE_PROFILE,
          voiceProfile: DEFAULT_VOICE_PROFILE,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const bookId = responseBookId(await createResponse.json().catch(() => undefined));
      if (!createResponse.ok || !bookId) {
        throw new Error("Could not open a writing room.");
      }

      // Persist the opening exchange before moving to Book Chat. The chat page
      // remains usable even if the Muse call is temporarily unavailable.
      await authenticatedFetch("/consultMuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, message: firstThought }),
      }).catch(() => undefined);

      void queryClient.invalidateQueries({ queryKey: ["books"] });
      navigate({ to: "/books/$bookId/chat", params: { bookId } });
    } catch {
      setError("We could not open your writing room. Your idea is still here; try again.");
      setState("idle");
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl animate-reveal flex-col px-5 py-8 sm:px-8 lg:px-10">
      <Link
        to="/books"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to shelf
      </Link>

      <header className="mt-10 border-b border-border pb-8">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          A new writing room
        </p>
        <h1 className="mt-3 font-display text-5xl italic leading-[1.05] text-foreground">
          Start with a conversation.
        </h1>
        <p className="mt-4 max-w-xl font-serif text-lg leading-8 text-muted-foreground">
          {WELCOME}
        </p>
      </header>

      <section className="mt-8 flex-1" aria-label="Start a book conversation">
        <div className="max-w-2xl border-l-2 border-accent/60 pl-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-accent" /> The Muse
          </div>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            What has been circling in your mind? There is no required format and no wrong place to
            begin.
          </p>
        </div>
      </section>

      <div className="border-t border-border pt-5">
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-3 rounded-md border border-border bg-card p-3 focus-within:border-accent">
          <textarea
            aria-label="Your opening thought"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                void startConversation();
              }
            }}
            maxLength={4_000}
            rows={5}
            disabled={state === "opening"}
            placeholder="I want to write a crime thriller about..."
            className="min-h-32 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />
          <Button
            type="button"
            onClick={() => void startConversation()}
            disabled={!message.trim() || state === "opening"}
          >
            {state === "opening" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {state === "opening" ? "Opening room" : "Talk with the Muse"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The manuscript stays empty until you explicitly draft and accept a scene.
        </p>
      </div>
    </div>
  );
}

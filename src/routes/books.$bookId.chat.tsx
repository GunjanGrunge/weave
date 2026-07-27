import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/api";

export const Route = createFileRoute("/books/$bookId/chat")({
  head: () => ({
    meta: [
      { title: "Book Chat - Story Platform" },
      { name: "description", content: "Write your book's next scene through a chat-first surface." },
    ],
  }),
  component: ChatRoute,
});

type ChatMessageType = "user" | "assistant_scene" | "structural_note" | "system";

type ChatMessage = {
  type: ChatMessageType;
  text: string;
  order: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; messages: ChatMessage[] }
  | { status: "error"; message: string };

type GenerationState = { status: "idle" | "loading" } | { status: "error"; message: string };

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
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generationState, setGenerationState] = useState<GenerationState>({ status: "idle" });
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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
        const result = (await response.json()) as { messages: ChatMessage[] };
        if (!cancelled) {
          setLoadState({ status: "ready", messages: result.messages });
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

  function appendMessage(message: ChatMessage) {
    setLoadState((current) =>
      current.status === "ready"
        ? { status: "ready", messages: [...current.messages, message] }
        : { status: "ready", messages: [message] },
    );
  }

  async function submitDescription() {
    const trimmed = description.trim();
    if (!trimmed) {
      setValidationError("Describe what happens in the scene before sending.");
      return;
    }
    setValidationError(null);
    setGenerationState({ status: "loading" });

    try {
      const response = await authenticatedFetch("/generateScene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, description: trimmed }),
      });
      if (!response.ok) {
        throw new Error("Generation failed.");
      }
      const result = (await response.json()) as {
        sessionId: string;
        text: string;
        provider: "openai" | "gemini";
        model: string;
      };

      appendMessage({ type: "user", text: trimmed, order: -1 });
      appendMessage({ type: "assistant_scene", text: result.text, order: -1 });
      setSessionId(result.sessionId);
      setDescription("");
      setGenerationState({ status: "idle" });
    } catch {
      setGenerationState({
        status: "error",
        message: "Couldn't generate a scene. Your description is still here.",
      });
    }
  }

  function retry() {
    void submitDescription();
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

      <h1 className="mt-2 font-display text-4xl italic">Book Chat</h1>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-2" data-testid="message-list">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            No messages yet. Describe a scene to begin.
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.type}-${message.order}-${index}`}
            className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${messageStyles(message.type)}`}
            >
              {message.type !== "user" && (
                <Sparkles className="mb-2 size-4 text-accent" aria-hidden="true" />
              )}
              {message.text}
            </div>
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

      <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 pl-4 focus-within:border-accent/40">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-label="Scene description"
          rows={2}
          className="flex-1 resize-none bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={submitDescription}
          disabled={isLoading}
          aria-label="Send"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
      {sessionId && <span className="sr-only">session:{sessionId}</span>}
    </div>
  );
}

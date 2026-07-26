import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send } from "lucide-react";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "AI Chat - Story Platform" },
      {
        name: "description",
        content: "A private conversation about your book with a context-aware co-author.",
      },
      { property: "og:title", content: "AI Chat - Story Platform" },
      { property: "og:description", content: "Talk to a co-author with manuscript context." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const [msg, setMsg] = useState("");

  return (
    <div className="mx-auto flex h-full max-w-3xl animate-reveal flex-col px-6 py-8 lg:px-10">
      <SectionLabel>Co-author</SectionLabel>
      <h1 className="mt-2 font-display text-4xl italic">AI Chat</h1>

      <div className="mt-6 flex-1 overflow-y-auto pr-2">
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No messages yet.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4 focus-within:border-accent/40">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          aria-label="Message"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PanelRightClose, PanelRightOpen, Send, Sparkle } from "lucide-react";
import { chapters, aiActions, currentBook } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/write")({
  head: () => ({
    meta: [
      { title: "Writing Studio - Story Platform" },
      {
        name: "description",
        content: "A distraction-free manuscript editor with a context-aware AI assistant.",
      },
      { property: "og:title", content: "Writing Studio - Story Platform" },
      { property: "og:description", content: "A focused manuscript editor with assistant tools." },
    ],
  }),
  component: WritingStudio,
});

function WritingStudio() {
  const [activeCh, setActiveCh] = useState(chapters[0]?.id ?? "");
  const [aiOpen, setAiOpen] = useState(true);
  const [ask, setAsk] = useState("");
  const chapter = chapters.find((c) => c.id === activeCh);

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar/40 md:flex">
        <div className="flex items-center justify-between px-4 py-3">
          <SectionLabel>Chapters</SectionLabel>
          <button className="grid size-5 place-items-center rounded bg-foreground/5 text-xs">
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {chapters.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCh(c.id)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                activeCh === c.id ? "bg-card ring-1 ring-border" : "hover:bg-foreground/5",
              )}
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Ch. {c.number} - {c.status}
              </div>
              <div
                className={cn(
                  "font-serif text-sm",
                  activeCh === c.id ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {c.title}
              </div>
            </button>
          ))}
          {chapters.length === 0 && (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              No chapters yet.
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-[65ch] animate-reveal px-6 py-16 lg:py-24">
          <SectionLabel>
            {currentBook.title}
            {chapter ? ` - Ch. ${chapter.number}` : ""}
          </SectionLabel>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-accent lg:text-5xl">
            {chapter?.title || "Writing Studio"}
          </h1>
          <div className="mt-12 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Manuscript text will appear here after a chapter is opened.
          </div>
          <div className="mt-16 flex items-center justify-between border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>
              {chapter ? `${chapter.wordCount.toLocaleString()} words - ${chapter.pov}` : "0 words"}
            </span>
            <span>Not saved yet</span>
          </div>
        </div>
      </section>

      {aiOpen ? (
        <aside className="hidden w-96 shrink-0 flex-col border-l border-border bg-sidebar/40 lg:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkle className="size-4 text-accent" />
              <SectionLabel>Story Assistant</SectionLabel>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-foreground/5"
              aria-label="Collapse"
            >
              <PanelRightClose className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <div>
              <SectionLabel>Context actions</SectionLabel>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {aiActions.map((a) => (
                  <button
                    key={a}
                    className="rounded-md border border-border bg-card px-2 py-2 text-[11px] font-medium hover:border-accent/40 hover:bg-accent/5"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>AI insight</SectionLabel>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Assistant insights will appear after manuscript context is available.
              </p>
            </div>

            <div>
              <SectionLabel>Conversation</SectionLabel>
              <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                No conversation yet.
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-card p-3">
            <div className="flex items-center gap-2 rounded-full bg-background px-3 py-2 ring-1 ring-border focus-within:ring-accent/40">
              <span className="size-1.5 rounded-full bg-accent" />
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                aria-label="Ask the assistant"
                className="flex-1 bg-transparent text-xs outline-none"
              />
              <button className="grid size-6 place-items-center rounded-full bg-accent text-accent-foreground">
                <Send className="size-3" />
              </button>
            </div>
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setAiOpen(true)}
          className="hidden h-full w-8 items-center justify-center border-l border-border bg-sidebar/40 text-muted-foreground hover:text-foreground lg:flex"
          aria-label="Open assistant"
        >
          <PanelRightOpen className="size-4" />
        </button>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PanelRightClose, PanelRightOpen, Send, Sparkle } from "lucide-react";
import { chapters, aiActions, currentBook } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/write")({
  head: () => ({
    meta: [
      { title: "Writing Studio · Story Platform" },
      { name: "description", content: "A distraction-free manuscript editor with a context-aware AI assistant." },
      { property: "og:title", content: "Writing Studio · Story Platform" },
      { property: "og:description", content: "Serif prose, drop caps, and an AI that suggests without shouting." },
    ],
  }),
  component: WritingStudio,
});

const MANUSCRIPT = [
  "The fog rolled into the capital not like a weather pattern, but like an unwanted memory. It was thick and tasted of iron and cedar, clinging to the stone gargoyles that watched the harbor with sightless eyes. Elias adjusted the weight of the compass in his pocket. It was vibrating again — a low, rhythmic thrum that matched the beat of a heart that wasn't his own.",
  "He had spent three months tracking the movement of the stars through the lens of a fractured telescope. Every calculation pointed to this exact moment. The meridian was shifting. Not geographically, but fundamentally. The world was being rewritten from the margins inward, and he was the only cartographer who could see the ink still wet on the horizon.",
  "He stepped onto the cobblestones. The city was quiet, held in a breathless pause. Somewhere in the distance, a bell tolled once, then stopped, as if the metal itself had decided that silence was the only appropriate response to what was coming.",
  "Isolde would be at the harbor by now. She always was, before dawn, listening for the second toll that never came. Elias had told her once, in a rare unguarded moment, that he thought the bell was waiting for permission. She had not laughed. She had said: 'From whom?'",
];

function WritingStudio() {
  const [activeCh, setActiveCh] = useState("ch12");
  const [aiOpen, setAiOpen] = useState(true);
  const [ask, setAsk] = useState("");
  const chapter = chapters.find((c) => c.id === activeCh)!;

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Chapter rail */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar/40 md:flex">
        <div className="flex items-center justify-between px-4 py-3">
          <SectionLabel>Chapters</SectionLabel>
          <button className="grid size-5 place-items-center rounded bg-foreground/5 text-xs">+</button>
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
                Ch. {c.number} · {c.status}
              </div>
              <div className={cn("font-serif text-sm", activeCh === c.id ? "text-foreground" : "text-muted-foreground")}>
                {c.title}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Manuscript */}
      <section className="flex-1 min-w-0 overflow-y-auto bg-background">
        <div className="mx-auto max-w-[65ch] animate-reveal px-6 py-16 lg:py-24">
          <SectionLabel>{currentBook.title} · Ch. {chapter.number}</SectionLabel>
          <h1 className="mt-3 font-display text-4xl italic leading-tight text-accent lg:text-5xl">
            {chapter.title}
          </h1>
          <div className="mt-12 space-y-7 font-serif text-[19px] leading-[1.85] text-foreground/90 selection:bg-accent/15">
            <p className="drop-cap">{MANUSCRIPT[0]}</p>
            {MANUSCRIPT.slice(1).map((p, i) => (
              <p key={i} className={i === 1 ? "rounded-md bg-accent/5 px-3 py-2 ring-1 ring-accent/10" : ""}>
                {p}
              </p>
            ))}
          </div>
          <div className="mt-16 flex items-center justify-between border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{chapter.wordCount.toLocaleString()} words · {chapter.pov}</span>
            <span>Autosaved · a moment ago</span>
          </div>
        </div>
      </section>

      {/* AI Assistant */}
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

            <div className="rounded-lg border border-accent/15 bg-accent/5 p-4">
              <SectionLabel className="!text-accent">Suggested revision</SectionLabel>
              <p className="mt-2 font-serif text-sm italic text-foreground/85">
                "The fog didn't arrive; it invaded. It brought the scent of rusted iron and dead cedar, wrapping itself around the city's throat."
              </p>
              <div className="mt-3 flex gap-4 font-mono text-[10px] uppercase tracking-widest">
                <button className="font-bold text-accent">Replace</button>
                <button className="text-muted-foreground">Compare</button>
                <button className="text-muted-foreground">Dismiss</button>
              </div>
            </div>

            <div>
              <SectionLabel>AI insight</SectionLabel>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Elias's compass is becoming a central symbol. Consider establishing the "thrumming" sensation earlier — Chapter 4 has a natural pocket where it would foreshadow the meridian shift.
              </p>
              <button className="mt-2 text-xs font-medium text-accent hover:underline">See impact map →</button>
            </div>

            <div>
              <SectionLabel>Conversation</SectionLabel>
              <div className="mt-3 space-y-3">
                <div className="rounded-lg bg-foreground/5 px-3 py-2 text-xs">
                  Does this scene establish Elias's isolation without becoming self-pitying?
                </div>
                <div className="border-l-2 border-accent/40 pl-3 font-serif text-sm leading-relaxed">
                  The isolation reads earned, not indulgent — the compass thrum externalizes his loneliness so we don't have to be told. One small note: the third paragraph does the emotional work already; the fourth's mention of Isolde risks explaining what the fog just showed.
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border bg-card p-3">
            <div className="flex items-center gap-2 rounded-full bg-background px-3 py-2 ring-1 ring-border focus-within:ring-accent/40">
              <span className="size-1.5 rounded-full bg-accent" />
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                placeholder="Ask the Muse..."
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
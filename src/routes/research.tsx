import { createFileRoute } from "@tanstack/react-router";
import { researchThreads } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { Bookmark, Send } from "lucide-react";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Research · Story Platform" },
      { name: "description", content: "Ask the AI for period detail, then save what you'll use." },
      { property: "og:title", content: "AI Research · Story Platform" },
      { property: "og:description", content: "Sourced answers for historical fiction and worldbuilding." },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Workspace</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">AI Research</h1>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {researchThreads.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="rounded-lg bg-foreground/5 px-3 py-2 text-sm">{t.q}</div>
              <p className="mt-3 border-l-2 border-accent/40 pl-3 font-serif text-base leading-relaxed">{t.a}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t.sources} sources
                </span>
                <button className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  <Bookmark className="size-3" /> Save snippet
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-full border border-border bg-card p-2 pl-4 flex items-center gap-2">
            <input
              placeholder="Ask about anything the book needs to know..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground">
              <Send className="size-3.5" />
            </button>
          </div>
        </div>

        <aside className="space-y-3">
          <SectionLabel>Saved snippets</SectionLabel>
          {[
            "Leather-lined bell yokes reused after cracks",
            "Valley fog forms at river confluences first",
            "Compagnia dei Cartografi (Venice, 1476)",
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 text-xs">
              <div className="line-clamp-2 font-serif">{s}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Saved · yesterday
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
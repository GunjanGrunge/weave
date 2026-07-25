import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { chapters as seed, type ChapterStatus } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { GripVertical } from "lucide-react";

export const Route = createFileRoute("/chapters")({
  head: () => ({
    meta: [
      { title: "Chapter Planner · Story Platform" },
      { name: "description", content: "Drag chapters across outline, drafting, revision, and done." },
      { property: "og:title", content: "Chapter Planner · Story Platform" },
      { property: "og:description", content: "The kanban of your manuscript." },
    ],
  }),
  component: ChaptersPage,
});

const columns: ChapterStatus[] = ["Outline", "Drafting", "Revision", "Done"];

function ChaptersPage() {
  const [items, setItems] = useState(seed);
  const [dragging, setDragging] = useState<string | null>(null);

  function moveTo(id: string, status: ChapterStatus) {
    setItems((arr) => arr.map((c) => (c.id === id ? { ...c, status } : c)));
  }

  return (
    <div className="mx-auto max-w-[1400px] animate-reveal px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Manuscript board</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">Chapter Planner</h1>
        </div>
        <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {columns.map((c) => (
            <span key={c}>
              {c}: <span className="text-foreground">{items.filter((i) => i.status === c).length}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <div
            key={col}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragging && (moveTo(dragging, col), setDragging(null))}
            className="min-h-[300px] rounded-2xl border border-border bg-card/50 p-3"
          >
            <div className="flex items-center justify-between px-2 py-1">
              <SectionLabel>{col}</SectionLabel>
              <span className="font-mono text-[10px] text-muted-foreground">
                {items.filter((i) => i.status === col).length}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {items
                .filter((i) => i.status === col)
                .map((c) => {
                  const pct = Math.min(1, c.wordCount / c.target);
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragging(c.id)}
                      onDragEnd={() => setDragging(null)}
                      className="cursor-grab rounded-xl border border-border bg-card p-3 active:cursor-grabbing hover:border-accent/40"
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 size-3 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            Ch. {c.number} · {c.pov}
                          </div>
                          <div className="mt-0.5 font-serif text-sm leading-tight">{c.title}</div>
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.summary}</p>
                          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-foreground/5">
                            <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {c.wordCount} / {c.target} words
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { publishingChecklist, currentBook } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { Check, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/publishing")({
  head: () => ({
    meta: [
      { title: "Publishing · Story Platform" },
      { name: "description", content: "Formatting, metadata, ISBN, and launch — the road from manuscript to printed book." },
      { property: "og:title", content: "Publishing Center · Story Platform" },
      { property: "og:description", content: "Every step from finished draft to on-sale date." },
    ],
  }),
  component: PublishingPage,
});

function PublishingPage() {
  const done = publishingChecklist.filter((c) => c.done).length;
  const pct = done / publishingChecklist.length;

  return (
    <div className="mx-auto max-w-5xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>The Long Road</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Publishing Center</h1>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-24 w-16 shrink-0 place-items-center rounded-sm bg-accent/10 font-display text-lg italic text-accent">
              {currentBook.cover}
            </div>
            <div>
              <SectionLabel>Manuscript</SectionLabel>
              <div className="mt-1 font-display text-2xl italic">{currentBook.title}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {currentBook.wordCount.toLocaleString()} words · {currentBook.status}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <SectionLabel>Publishing readiness</SectionLabel>
              <span className="font-mono text-xs">{done} / {publishingChecklist.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/5">
              <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5">
              <FileText className="size-3.5" /> Preview manuscript
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5">
              <Download className="size-3.5" /> Export EPUB
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
              Submit to KDP
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <SectionLabel>Launch window</SectionLabel>
          <div className="mt-2 font-display text-3xl italic">Autumn</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Oct 21, 2026</div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div>ARCs: 30 requested, 12 confirmed</div>
            <div>Bookstagram tour: 8 confirmed</div>
            <div>Print run: 3,500 (Ingram)</div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <SectionLabel>Publishing checklist</SectionLabel>
        </div>
        <ul className="divide-y divide-border">
          {publishingChecklist.map((c) => (
            <li key={c.id} className="flex items-start gap-4 p-5">
              <div
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                  c.done ? "bg-accent text-accent-foreground" : "border border-border"
                }`}
              >
                {c.done && <Check className="size-3" />}
              </div>
              <div className="flex-1">
                <div className={`font-serif text-base ${c.done ? "text-muted-foreground line-through" : ""}`}>
                  {c.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{c.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
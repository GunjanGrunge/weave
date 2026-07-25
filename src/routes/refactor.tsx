import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { refactorImpact } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";
import { Check, X, GitBranch, ArrowRight, Clock } from "lucide-react";

export const Route = createFileRoute("/refactor")({
  head: () => ({
    meta: [
      { title: "Story Refactor · Story Platform" },
      { name: "description", content: "Change a character, plot, or symbol — and see the butterfly effect across every chapter." },
      { property: "og:title", content: "Story Refactor · Story Platform" },
      { property: "og:description", content: "Signature feature: rewrite one thread of your novel with AI-drafted diffs, chapter-by-chapter." },
    ],
  }),
  component: RefactorPage,
});

function RefactorPage() {
  const [decisions, setDecisions] = useState<Record<number, "accepted" | "rejected" | null>>({});

  function decide(ch: number, v: "accepted" | "rejected") {
    setDecisions({ ...decisions, [ch]: decisions[ch] === v ? null : v });
  }

  const before = refactorImpact.diff.before;
  const after = highlight(refactorImpact.diff.after, refactorImpact.diff.highlights);

  return (
    <div className="mx-auto max-w-[1400px] animate-reveal px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <SectionLabel>Signature feature</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic lg:text-5xl">Story Refactor</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Change one fundamental element and let the AI map the butterfly effect across your entire manuscript. Review, accept, or reject each chapter's rewrite.
          </p>
          <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-accent/5 px-4 py-2 ring-1 ring-accent/10">
            <GitBranch className="size-4 text-accent" />
            <span className="font-serif italic text-foreground">{refactorImpact.from}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <span className="font-serif italic text-accent">{refactorImpact.to}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="rounded-md border border-border bg-card px-4 py-2 text-sm">Discard branch</button>
          <button className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm shadow-accent/20">
            Apply all changes
          </button>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-12 gap-6">
        {/* Left rail */}
        <div className="col-span-12 space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <SectionLabel>Refactor scope</SectionLabel>
            <div className="mt-5 space-y-4">
              <Stat label="Chapters affected" value={refactorImpact.chaptersAffected.toString()} />
              <Stat label="Conflict risks" value={refactorImpact.conflictRisks.toString()} tone="warn" />
              <Stat label="Estimated rewrite" value={`${refactorImpact.estimatedRewrite.toLocaleString()} words`} />
              <Stat label="Version" value="v3 · today 10:12" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <SectionLabel>Consistency map</SectionLabel>
            <div className="mt-4 space-y-3">
              {refactorImpact.affectedChapters.map((c) => {
                const decision = decisions[c.chapter];
                return (
                  <div key={c.chapter} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        c.status === "auto"
                          ? "bg-emerald-500"
                          : c.status === "review"
                          ? "bg-amber-500"
                          : "bg-accent",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Ch. {c.chapter}
                        </span>
                        {decision === "accepted" && (
                          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                            Accepted
                          </span>
                        )}
                        {decision === "rejected" && (
                          <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-red-700 dark:text-red-300">
                            Rejected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{c.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <SectionLabel>Version history</SectionLabel>
            <div className="mt-4 space-y-3">
              {refactorImpact.versions.map((v, i) => (
                <div key={v.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn("size-2 rounded-full", i === 1 ? "bg-accent" : "bg-foreground/20")} />
                    {i < refactorImpact.versions.length - 1 && <div className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      <Clock className="size-3" /> {v.date}
                    </div>
                    <div className="mt-0.5 font-serif text-sm">{v.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{v.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Diff */}
        <div className="col-span-12 lg:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-2 border-b border-border">
              <div className="border-r border-border bg-foreground/[0.03] p-4">
                <SectionLabel>Original text</SectionLabel>
              </div>
              <div className="bg-accent/5 p-4">
                <SectionLabel className="!text-accent">Refactored version</SectionLabel>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-r border-border p-8 font-serif text-[15px] leading-[1.85] text-muted-foreground line-through decoration-foreground/20">
                {before}
              </div>
              <div className="bg-accent/[0.02] p-8 font-serif text-[15px] leading-[1.85] text-foreground">
                {after}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-foreground/[0.02] px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Chapter {refactorImpact.diff.chapter} · Page {refactorImpact.diff.page}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(refactorImpact.diff.chapter, "rejected")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium",
                    decisions[refactorImpact.diff.chapter] === "rejected" && "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300",
                  )}
                >
                  <X className="size-3" /> Reject
                </button>
                <button
                  onClick={() => decide(refactorImpact.diff.chapter, "accepted")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground",
                    decisions[refactorImpact.diff.chapter] === "accepted" && "ring-2 ring-accent/40",
                  )}
                >
                  <Check className="size-3" /> Accept
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <SectionLabel>Impact analysis</SectionLabel>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <ImpactStat label="Semantic drift" value="12%" note="Well within acceptable range." tone="ok" />
              <ImpactStat label="Tone match" value="97%" note="Voice preserved across chapters." tone="ok" />
              <ImpactStat label="Reader continuity" value="2 risks" note="Chs. 6 and 9 need a human pass." tone="warn" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-xs font-semibold", tone === "warn" ? "text-amber-600 dark:text-amber-400" : "")}>
        {value}
      </span>
    </div>
  );
}

function ImpactStat({ label, value, note, tone }: { label: string; value: string; note: string; tone: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <SectionLabel>{label}</SectionLabel>
      <div className={cn("mt-2 font-display text-2xl italic", tone === "warn" ? "text-amber-600" : "text-accent")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function highlight(text: string, terms: string[]) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const found = terms
      .map((t) => ({ t, idx: rest.indexOf(t) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)[0];
    if (!found) {
      parts.push(rest);
      break;
    }
    if (found.idx > 0) parts.push(rest.slice(0, found.idx));
    parts.push(
      <span key={key++} className="rounded bg-emerald-500/15 px-1 text-emerald-800 dark:text-emerald-200">
        {found.t}
      </span>,
    );
    rest = rest.slice(found.idx + found.t.length);
  }
  return parts;
}
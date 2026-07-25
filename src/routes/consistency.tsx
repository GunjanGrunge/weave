import { createFileRoute } from "@tanstack/react-router";
import { consistencyIssues } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/consistency")({
  head: () => ({
    meta: [
      { title: "Consistency · Story Platform" },
      { name: "description", content: "Character, timeline, and plot issues surfaced by the AI reader." },
      { property: "og:title", content: "Story Consistency · Story Platform" },
      { property: "og:description", content: "Continuity errors, before your editor sees them." },
    ],
  }),
  component: ConsistencyPage,
});

const kinds = ["Character", "Timeline", "Plot"] as const;

const severityStyles = {
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
  med: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function ConsistencyPage() {
  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Continuity</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">Story Consistency</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            An AI reader combed the manuscript and flagged six places where the book contradicts itself.
          </p>
        </div>
        <div className="flex gap-3">
          <StatCard label="Issues" value="6" />
          <StatCard label="High" value="3" tone="bad" />
          <StatCard label="Fixed today" value="12" tone="good" />
        </div>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {kinds.map((k) => (
          <div key={k} className="space-y-3">
            <SectionLabel>{k}</SectionLabel>
            {consistencyIssues
              .filter((i) => i.kind === k)
              .map((issue) => (
                <div key={issue.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-3.5 text-muted-foreground" />
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${severityStyles[issue.severity]}`}>
                      {issue.severity}
                    </span>
                  </div>
                  <div className="mt-3 font-serif text-base leading-tight">{issue.title}</div>
                  <p className="mt-2 text-xs text-muted-foreground">{issue.detail}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Chapter {issue.chapter}
                    </span>
                    <button className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
                      Jump →
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-2xl italic ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
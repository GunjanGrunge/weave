import { createFileRoute } from "@tanstack/react-router";
import { timelineEvents, characters } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline · Story Platform" },
      { name: "description", content: "Every event, in the order the reader will meet it." },
      { property: "og:title", content: "Story Timeline · Story Platform" },
      { property: "og:description", content: "The chronology of your manuscript." },
    ],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  return (
    <div className="mx-auto max-w-4xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Chronology</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Story Timeline</h1>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {["All", ...new Set(characters.slice(0, 4).map((c) => c.name.split(" ")[0]))].map((f, i) => (
          <button
            key={f}
            className={
              i === 0
                ? "rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-accent/40"
            }
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-10 space-y-8 border-l-2 border-border pl-8">
        {timelineEvents.map((e) => (
          <div key={e.id} className="relative">
            <div className="absolute -left-[41px] mt-1.5 grid size-4 place-items-center rounded-full bg-background ring-2 ring-accent">
              <span className="size-1.5 rounded-full bg-accent" />
            </div>
            <SectionLabel>{e.year}</SectionLabel>
            <div className="mt-1 font-display text-2xl italic leading-tight">{e.title}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Chapter {e.chapter}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
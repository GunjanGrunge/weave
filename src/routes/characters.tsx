import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { characters, relationships } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Characters - Story Platform" },
      {
        name: "description",
        content: "Profile cards, arcs, and a relationship graph for your cast.",
      },
      { property: "og:title", content: "Character Manager - Story Platform" },
      {
        property: "og:description",
        content: "Trace the pull between every character in your book.",
      },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const [selected, setSelected] = useState(characters[0]?.id ?? "");
  const active = characters.find((c) => c.id === selected);
  const nodes = characters.map((c, i) => {
    const angle = (i / Math.max(characters.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...c, x: 250 + Math.cos(angle) * 180, y: 250 + Math.sin(angle) * 180 };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="mx-auto max-w-7xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Cast</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Character Manager</h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Character profiles and relationships will appear here after a book is active.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-4 lg:col-span-7">
          <SectionLabel>Profiles</SectionLabel>
          {characters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No characters yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    selected === c.id
                      ? "border-accent/50 bg-accent/5"
                      : "border-border bg-card hover:border-accent/30",
                  )}
                >
                  <div
                    className="grid size-11 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-base leading-tight">{c.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {c.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>Selected</SectionLabel>
            {active ? (
              <div className="mt-3">
                <div className="font-serif text-xl leading-tight">{active.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {active.role}
                </div>
                <p className="mt-4 font-serif text-sm text-foreground/90">{active.arc}</p>
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted-foreground">No character selected.</div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <SectionLabel>Relationship graph</SectionLabel>
            {nodes.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No relationships yet.
              </div>
            ) : (
              <svg viewBox="0 0 500 500" className="mt-2 aspect-square w-full">
                {relationships.map((r, i) => {
                  const a = byId[r.from];
                  const b = byId[r.to];
                  if (!a || !b) return null;
                  const highlight = r.from === selected || r.to === selected;
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={highlight ? "var(--color-accent)" : "currentColor"}
                      strokeOpacity={highlight ? 0.7 : 0.15}
                      strokeWidth={highlight ? 2 : 1}
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

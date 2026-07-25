import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { characters, relationships } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/characters")({
  head: () => ({
    meta: [
      { title: "Characters · Story Platform" },
      { name: "description", content: "Profile cards, arcs, and a live relationship graph for your cast." },
      { property: "og:title", content: "Character Manager · Story Platform" },
      { property: "og:description", content: "Trace the pull between every character in your book." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const [selected, setSelected] = useState("elias");
  const active = characters.find((c) => c.id === selected)!;

  const nodes = characters.map((c, i) => {
    const angle = (i / characters.length) * Math.PI * 2 - Math.PI / 2;
    return { ...c, x: 250 + Math.cos(angle) * 180, y: 250 + Math.sin(angle) * 180 };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="mx-auto max-w-7xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Cast</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Character Manager</h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Eight named voices carry this book. Trace the tension between them.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <SectionLabel>Profiles</SectionLabel>
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
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.traits.map((t) => (
                      <span key={t} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>Selected</SectionLabel>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid size-14 place-items-center rounded-full text-white font-mono text-xs font-bold" style={{ backgroundColor: active.color }}>{active.initials}</div>
              <div>
                <div className="font-serif text-xl leading-tight">{active.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{active.role}</div>
              </div>
            </div>
            <div className="mt-4">
              <SectionLabel>Arc</SectionLabel>
              <p className="mt-1 font-serif text-sm text-foreground/90">{active.arc}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <SectionLabel>Relationship graph</SectionLabel>
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
              {nodes.map((n) => (
                <g key={n.id} onClick={() => setSelected(n.id)} style={{ cursor: "pointer" }}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={selected === n.id ? 26 : 20}
                    fill={n.color}
                    fillOpacity={selected === n.id ? 1 : 0.9}
                    stroke="var(--color-background)"
                    strokeWidth="3"
                  />
                  <text
                    x={n.x}
                    y={n.y + 4}
                    textAnchor="middle"
                    className="fill-white font-mono text-[10px] font-bold"
                  >
                    {n.initials}
                  </text>
                  <text
                    x={n.x}
                    y={n.y + 40}
                    textAnchor="middle"
                    className="fill-foreground font-mono text-[10px]"
                  >
                    {n.name.split(" ")[0]}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
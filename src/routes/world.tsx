import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { locations, organizations, loreEntries, timelineEvents } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";
import { MapIcon } from "lucide-react";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "World Building · Story Platform" },
      { name: "description", content: "Locations, timelines, organizations, and lore — the atlas of your story." },
      { property: "og:title", content: "World Building · Story Platform" },
      { property: "og:description", content: "The atlas of your story, all in one place." },
    ],
  }),
  component: WorldPage,
});

const tabs = ["Locations", "Timeline", "Maps", "Organizations", "Lore"] as const;
type Tab = (typeof tabs)[number];

function WorldPage() {
  const [tab, setTab] = useState<Tab>("Locations");

  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Atlas</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">World Building</h1>
      </header>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm transition-colors",
              tab === t ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "Locations" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-5">
                <SectionLabel>{l.kind}</SectionLabel>
                <div className="mt-2 font-display text-xl italic">{l.name}</div>
                <p className="mt-2 font-serif text-sm text-foreground/80">{l.note}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "Timeline" && (
          <div className="relative overflow-x-auto rounded-2xl border border-border bg-card p-6">
            <div className="min-w-[720px]">
              <div className="relative h-1 rounded-full bg-foreground/5">
                <div className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-accent/60" />
              </div>
              <div className="mt-8 grid grid-cols-7 gap-4">
                {timelineEvents.map((e) => (
                  <div key={e.id} className="relative">
                    <div className="absolute -top-11 left-1/2 size-3 -translate-x-1/2 rounded-full bg-accent" />
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ch. {e.chapter}</div>
                    <div className="mt-1 font-serif text-sm leading-tight">{e.title}</div>
                    <div className="mt-1 text-[10px] italic text-muted-foreground">{e.year}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "Maps" && (
          <div className="grid gap-4 md:grid-cols-2">
            {["The Capital of Aethelgard", "The Long Coast", "Obsidian Ridge"].map((name, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid h-48 place-items-center bg-gradient-to-br from-accent/10 via-background to-foreground/5 text-muted-foreground">
                  <MapIcon className="size-10 opacity-40" />
                </div>
                <div className="p-4">
                  <div className="font-serif text-lg">{name}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Sketch · v{i + 1}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "Organizations" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {organizations.map((o) => (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="font-display text-xl italic">{o.name}</div>
                <p className="mt-2 font-serif text-sm italic text-muted-foreground">"{o.motto}"</p>
                <div className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {o.members} members
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "Lore" && (
          <div className="space-y-4">
            {loreEntries.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-6">
                <SectionLabel>Lore</SectionLabel>
                <div className="mt-2 font-display text-2xl italic">{l.title}</div>
                <p className="mt-3 font-serif text-base leading-relaxed text-foreground/85">{l.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
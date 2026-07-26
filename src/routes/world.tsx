import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type ReactNode } from "react";
import { locations, organizations, loreEntries, timelineEvents } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";
import { MapIcon } from "lucide-react";

export const Route = createFileRoute("/world")({
  head: () => ({
    meta: [
      { title: "World Building - Story Platform" },
      { name: "description", content: "Locations, timelines, organizations, and lore." },
      { property: "og:title", content: "World Building - Story Platform" },
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
              tab === t
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "Locations" && (
          <EmptyOrGrid emptyText="No locations yet.">
            {locations.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-5">
                <SectionLabel>{l.kind}</SectionLabel>
                <div className="mt-2 font-display text-xl italic">{l.name}</div>
                <p className="mt-2 font-serif text-sm text-foreground/80">{l.note}</p>
              </div>
            ))}
          </EmptyOrGrid>
        )}

        {tab === "Timeline" && (
          <EmptyOrGrid emptyText="No timeline events yet.">
            {timelineEvents.map((e) => (
              <div key={e.id} className="rounded-2xl border border-border bg-card p-5">
                <SectionLabel>Chapter {e.chapter}</SectionLabel>
                <div className="mt-2 font-display text-xl italic">{e.title}</div>
                <div className="mt-2 text-xs text-muted-foreground">{e.year}</div>
              </div>
            ))}
          </EmptyOrGrid>
        )}

        {tab === "Maps" && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            <MapIcon className="mb-3 size-6 opacity-50" />
            No maps yet.
          </div>
        )}

        {tab === "Organizations" && (
          <EmptyOrGrid emptyText="No organizations yet.">
            {organizations.map((o) => (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="font-display text-xl italic">{o.name}</div>
                <p className="mt-2 font-serif text-sm italic text-muted-foreground">{o.motto}</p>
                <div className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {o.members} members
                </div>
              </div>
            ))}
          </EmptyOrGrid>
        )}

        {tab === "Lore" && (
          <div className="space-y-4">
            {loreEntries.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-6">
                <SectionLabel>Lore</SectionLabel>
                <div className="mt-2 font-display text-2xl italic">{l.title}</div>
                <p className="mt-3 font-serif text-base leading-relaxed text-foreground/85">
                  {l.body}
                </p>
              </div>
            ))}
            {loreEntries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No lore entries yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyOrGrid({ children, emptyText }: { children: ReactNode; emptyText: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items}</div>;
}

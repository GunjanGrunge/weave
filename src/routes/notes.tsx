import { createFileRoute } from "@tanstack/react-router";
import { SectionLabel } from "@/components/common/SectionLabel";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "Notes · Story Platform" },
      { name: "description", content: "Scraps, epiphanies, and lines that don't have a home yet." },
      { property: "og:title", content: "Notes · Story Platform" },
      { property: "og:description", content: "Loose notes waiting for a chapter." },
    ],
  }),
  component: NotesPage,
});

const notes = [
  { title: "The bell is waiting for permission", body: "'From whom?' — Isolde's line. Save for a later book if not this one.", tag: "Dialogue" },
  { title: "Compass thrum as heartbeat", body: "A heart that isn't his own. This becomes literal at some point — the compass belonged to someone.", tag: "Symbol" },
  { title: "The Waiting Room breathes", body: "Only when unattended. What is it inhaling? The book might not answer.", tag: "Worldbuilding" },
  { title: "Cassia's voice is too clean", body: "She should occasionally trip on a word — pride showing through control.", tag: "Character" },
  { title: "Ink still wet", body: "Title candidate. Also: recurring image on page 1, 204, and 380?", tag: "Structure" },
  { title: "Meren gives the compass its name", body: "Not Elias. Meren says it out loud first — 'that's a glass rose, boy.'", tag: "Plot" },
];

function NotesPage() {
  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-10 lg:px-10">
      <header className="flex items-end justify-between border-b border-border pb-6">
        <div>
          <SectionLabel>Scratchpad</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">Notes</h1>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          <Plus className="size-4" /> New note
        </button>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {notes.map((n) => (
          <div key={n.title} className="rounded-2xl border border-border bg-card p-5">
            <SectionLabel>{n.tag}</SectionLabel>
            <div className="mt-2 font-serif text-lg leading-tight">{n.title}</div>
            <p className="mt-3 text-sm text-muted-foreground">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
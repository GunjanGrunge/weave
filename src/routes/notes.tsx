import { createFileRoute } from "@tanstack/react-router";
import { SectionLabel } from "@/components/common/SectionLabel";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/notes")({
  head: () => ({
    meta: [
      { title: "Notes - Story Platform" },
      {
        name: "description",
        content: "Scraps, epiphanies, and lines that do not have a home yet.",
      },
      { property: "og:title", content: "Notes - Story Platform" },
      { property: "og:description", content: "Loose notes waiting for a chapter." },
    ],
  }),
  component: NotesPage,
});

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

      <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        No notes yet.
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { books } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/books")({
  head: () => ({
    meta: [
      { title: "My Books · Story Platform" },
      { name: "description", content: "Every manuscript you're writing, planning, or publishing — in one shelf." },
      { property: "og:title", content: "My Books · Story Platform" },
      { property: "og:description", content: "Your bookshelf of drafts and finished manuscripts." },
    ],
  }),
  component: BooksPage,
});

function BooksPage() {
  return (
    <div className="mx-auto max-w-6xl animate-reveal px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Your shelf</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">My Books</h1>
        </div>
        <Link
          to="/books/new"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          <Plus className="size-4" /> New book
        </Link>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((b) => (
          <Link
            key={b.id}
            to="/write"
            className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-accent/40 hover:shadow-sm"
          >
            <div className="flex gap-5">
              <div className="grid h-32 w-24 shrink-0 place-items-center rounded-sm bg-gradient-to-br from-accent/15 to-accent/5 font-display text-2xl italic text-accent shadow-inner">
                {b.cover}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{b.status}</div>
                <div className="mt-1 font-serif text-xl leading-tight">{b.title}</div>
                <div className="mt-1 truncate text-xs italic text-muted-foreground">{b.subtitle}</div>
              </div>
            </div>
            <div className="mt-5 h-1 overflow-hidden rounded-full bg-foreground/5">
              <div className="h-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{b.wordCount.toLocaleString()} / {b.wordGoal.toLocaleString()}</span>
              <span>{b.lastEdited}</span>
            </div>
          </Link>
        ))}
        <Link
          to="/books/new"
          className="grid min-h-[13rem] place-items-center rounded-2xl border border-dashed border-border text-muted-foreground hover:border-accent/40 hover:text-accent"
        >
          <div className="text-center">
            <Plus className="mx-auto size-6" />
            <div className="mt-2 font-serif italic">Begin a new book</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
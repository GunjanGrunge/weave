import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, MessageSquareText, Plus, RefreshCw } from "lucide-react";

import { SectionLabel } from "@/components/common/SectionLabel";
import { Button } from "@/components/ui/button";
import { formatBookDate, useBooks } from "@/lib/books";

export const Route = createFileRoute("/books/")({
  head: () => ({
    meta: [
      { title: "My Books - WEAVE" },
      { name: "description", content: "Open or continue one of your manuscripts." },
    ],
  }),
  component: BooksPage,
});

export function BooksPage() {
  const booksQuery = useBooks();
  const books = booksQuery.data;
  const hasBooks = books !== undefined;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <SectionLabel>Your workspace</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">My Books</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Every book shown here belongs to your signed-in writer account.
          </p>
        </div>
        <Button asChild>
          <Link to="/books/new">
            <Plus className="size-4" />
            New book
          </Link>
        </Button>
      </header>

      {booksQuery.isPending && !hasBooks && <BooksLoading />}

      {booksQuery.isError && (
        <div className="mt-8 border-y border-border py-10 text-center">
          <p className="text-sm font-medium">Your books could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your manuscripts are still stored. Retry the connection.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => booksQuery.refetch()}
          >
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      )}

      {hasBooks && books.length === 0 && (
        <div className="mt-8 grid min-h-72 place-items-center border-y border-border py-12 text-center">
          <div className="max-w-sm">
            <BookOpen className="mx-auto size-7 text-accent" />
            <h2 className="mt-4 font-display text-2xl italic">Begin your first book</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              A short guided conversation will create the book, its first chapter, and its Vision.
            </p>
            <Button asChild className="mt-5">
              <Link to="/books/new">
                <Plus className="size-4" />
                Start a book
              </Link>
            </Button>
          </div>
        </div>
      )}

      {hasBooks && books.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Link
              key={book.bookId}
              to="/books/$bookId/chat"
              params={{ bookId: book.bookId }}
              className="group flex min-h-52 flex-col rounded-md border border-border bg-card p-5 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                  <BookOpen className="size-5" />
                </div>
                <span className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                  Ready to write
                </span>
              </div>
              <h2 className="mt-5 line-clamp-2 font-serif text-xl font-semibold leading-snug">
                {book.title || "Untitled Book"}
              </h2>
              <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {formatBookDate(book.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  <MessageSquareText className="size-3.5" />
                  Open chat
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BooksLoading() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading books">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="min-h-52 animate-pulse rounded-md border border-border p-5">
          <div className="size-11 rounded-md bg-foreground/10" />
          <div className="mt-5 h-5 w-2/3 rounded-sm bg-foreground/10" />
          <div className="mt-2 h-4 w-1/2 rounded-sm bg-foreground/5" />
        </div>
      ))}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CirclePlus, MessageSquareText, Server } from "lucide-react";

import { SectionLabel } from "@/components/common/SectionLabel";
import { Button } from "@/components/ui/button";
import { formatBookDate, useBooks } from "@/lib/books";
import { checkBackendHealth, type HealthCheckResult } from "@/lib/health";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Workspace - WEAVE" },
      { name: "description", content: "Open a manuscript or begin a new book." },
    ],
  }),
  component: Dashboard,
});

export function Dashboard() {
  const booksQuery = useBooks();
  const [health, setHealth] = useState<HealthCheckResult>({
    status: "idle",
    message: "Checking backend",
  });

  useEffect(() => {
    let mounted = true;
    setHealth({ status: "checking", message: "Checking backend" });
    void checkBackendHealth().then((result) => {
      if (mounted) setHealth(result);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const books = booksQuery.data ?? [];
  const hasBooks = booksQuery.data !== undefined;
  const latestBook = books[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6">
        <div>
          <SectionLabel>Writer workspace</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic">Your manuscripts</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Continue a real book from your account or begin a new guided intake.
          </p>
        </div>
        <Button asChild>
          <Link to="/books/new">
            <CirclePlus className="size-4" />
            New book
          </Link>
        </Button>
      </header>

      <div className="grid border-b border-border sm:grid-cols-2">
        <div className="border-b border-border py-5 sm:border-b-0 sm:border-r sm:pr-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="size-4" />
            Books in this account
          </div>
          <div className="mt-2 font-display text-3xl italic">
            {hasBooks ? books.length : booksQuery.isPending ? "..." : "N/A"}
          </div>
        </div>
        <div className="py-5 sm:pl-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="size-4" />
            Backend
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium">
            <span
              className={`size-2 rounded-full ${
                health.status === "ok"
                  ? "bg-emerald-500"
                  : health.status === "checking" || health.status === "idle"
                    ? "bg-amber-500"
                    : "bg-destructive"
              }`}
            />
            {health.status === "ok"
              ? "Connected"
              : health.status === "checking" || health.status === "idle"
                ? "Checking"
                : "Unavailable"}
          </div>
        </div>
      </div>

      <section className="py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <SectionLabel>Continue writing</SectionLabel>
            <h2 className="mt-2 font-display text-2xl italic">Recent books</h2>
          </div>
          <Link to="/books" className="inline-flex items-center gap-1 text-sm text-accent">
            View shelf
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {booksQuery.isPending && !hasBooks && (
          <div className="mt-5 h-32 animate-pulse rounded-md border border-border bg-card" />
        )}

        {booksQuery.isError && !hasBooks && (
          <div className="mt-5 border-y border-border py-8">
            <p className="text-sm font-medium">Books could not be loaded.</p>
            <button
              type="button"
              onClick={() => booksQuery.refetch()}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {hasBooks && !latestBook && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-5 border-y border-border py-8">
            <div>
              <p className="font-serif text-lg">No books yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with the guided conversation. You can skip any question.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/books/new">
                <CirclePlus className="size-4" />
                Start a book
              </Link>
            </Button>
          </div>
        )}

        {hasBooks && latestBook && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {books.slice(0, 4).map((book) => (
              <Link
                key={book.bookId}
                to="/books/$bookId/chat"
                params={{ bookId: book.bookId }}
                className="group flex min-h-32 items-center gap-4 rounded-md border border-border bg-card p-5 hover:border-accent/50"
              >
                <div className="grid size-11 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                  <MessageSquareText className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif text-lg font-semibold">
                    {book.title || "Untitled Book"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatBookDate(book.createdAt)}
                  </p>
                  <p className="mt-3 text-xs font-medium text-accent">Open book chat</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-accent" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

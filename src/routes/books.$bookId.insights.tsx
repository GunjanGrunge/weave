import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, ArrowRight, BarChart3, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";

import { subscribeBookUsage, type UsageSummary } from "@/lib/usage";

export const Route = createFileRoute("/books/$bookId/insights")({
  head: () => ({
    meta: [
      { title: "Book Insights - WEAVE" },
      { name: "description", content: "Review AI calls and token usage for this book." },
    ],
  }),
  component: InsightsRoute,
});

type InsightsState =
  | { status: "loading" }
  | { status: "ready"; summary: UsageSummary }
  | { status: "error" };

function InsightsRoute() {
  const { bookId } = Route.useParams();
  return <InsightsPage bookId={bookId} />;
}

function number(value: number): string {
  return value.toLocaleString("en-US");
}

export function InsightsPage({ bookId }: { bookId: string }) {
  const [state, setState] = useState<InsightsState>({ status: "loading" });

  useEffect(
    () =>
      subscribeBookUsage(
        bookId,
        (summary) => setState({ status: "ready", summary }),
        () => setState({ status: "error" }),
      ),
    [bookId],
  );

  const summary =
    state.status === "ready"
      ? state.summary
      : { callCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const inputShare =
    summary.totalTokens > 0 ? Math.round((summary.inputTokens / summary.totalTokens) * 100) : 0;
  const outputShare = summary.totalTokens > 0 ? 100 - inputShare : 0;

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/books/$bookId/chat"
              params={{ bookId }}
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back to book chat"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Production
              </p>
              <h1 className="truncate text-xl font-semibold">Book insights</h1>
            </div>
          </div>
          <Link
            to="/books/$bookId/chat"
            params={{ bookId }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <MessageSquareText className="size-4" />
            Return to Chat
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Live usage
          </p>
          <h2 className="mt-2 font-display text-4xl italic">How this book uses AI</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Calls and tokens update as WEAVE drafts, revises, extracts memory, and creates
            embeddings for this book.
          </p>
        </div>

        {state.status === "error" ? (
          <p role="alert" className="mt-8 border-y border-destructive/30 py-5 text-destructive">
            Usage data is unavailable right now.
          </p>
        ) : (
          <>
            <section className="mt-10 grid border-y border-border sm:grid-cols-3">
              {[
                ["AI calls", number(summary.callCount)],
                ["Total tokens", number(summary.totalTokens)],
                [
                  "Average per call",
                  number(
                    summary.callCount > 0 ? Math.round(summary.totalTokens / summary.callCount) : 0,
                  ),
                ],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className={`py-6 sm:px-6 ${index > 0 ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 font-display text-3xl italic">{value}</p>
                </div>
              ))}
            </section>

            <section className="mt-10">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-accent" />
                <h3 className="text-sm font-semibold">Token distribution</h3>
              </div>
              <div className="mt-5 h-3 w-full overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${inputShare}%` }}
                  title={`${inputShare}% input tokens`}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between border-b border-border py-3 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-2 bg-accent" /> Input context
                  </span>
                  <span className="font-medium">
                    {number(summary.inputTokens)}{" "}
                    <span className="text-muted-foreground">({inputShare}%)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-3 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-2 bg-foreground/30" /> Generated output
                  </span>
                  <span className="font-medium">
                    {number(summary.outputTokens)}{" "}
                    <span className="text-muted-foreground">({outputShare}%)</span>
                  </span>
                </div>
              </div>
            </section>

            {state.status === "loading" ? (
              <p
                role="status"
                className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Activity className="size-4 animate-pulse" /> Loading book usage
              </p>
            ) : summary.callCount === 0 ? (
              <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
                <p className="text-sm text-muted-foreground">
                  Usage will appear after the first AI-assisted writing action.
                </p>
                <Link
                  to="/books/$bookId/chat"
                  params={{ bookId }}
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent"
                >
                  Start in Chat <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

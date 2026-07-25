import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Flame, Target, BookOpen, GitBranch, MessagesSquare, Plus, PenLine } from "lucide-react";
import { books, currentBook, chapters, timelineEvents } from "@/lib/mock-data";
import { SectionLabel } from "@/components/common/SectionLabel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Story Platform" },
      { name: "description", content: "Your writing streak, daily goal, and active manuscripts — Story Platform." },
      { property: "og:title", content: "Dashboard · Story Platform" },
      { property: "og:description", content: "The command center for your writing life." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const goalPct = Math.min(1, currentBook.wordsToday / currentBook.dailyGoal);
  const activeChapter = chapters.find((c) => c.number === 12)!;

  return (
    <div className="mx-auto max-w-7xl animate-reveal px-6 py-10 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <SectionLabel>Good evening, Elias</SectionLabel>
          <h1 className="mt-2 font-display text-4xl italic text-foreground lg:text-5xl">
            The desk is waiting.
          </h1>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground">
            You are twelve days into your longest streak of the year. One page tonight keeps it alive.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/write"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm shadow-accent/20 hover:opacity-95"
          >
            <PenLine className="size-4" /> Continue writing
          </Link>
          <Link
            to="/refactor"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-foreground/5"
          >
            <GitBranch className="size-4" /> Story refactor
          </Link>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-12 gap-4">
        {/* Streak */}
        <div className="col-span-12 md:col-span-4 rounded-2xl bg-accent p-6 text-accent-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <SectionLabel className="!text-accent-foreground/70">Writing streak</SectionLabel>
            <Flame className="size-4" />
          </div>
          <div className="mt-6 flex items-baseline gap-2">
            <div className="font-display text-6xl italic leading-none">{currentBook.streak}</div>
            <div className="text-sm text-accent-foreground/80">days</div>
          </div>
          <div className="mt-6 flex gap-1">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className={`h-6 flex-1 rounded-sm ${i < 12 ? "bg-accent-foreground/80" : "bg-accent-foreground/20"}`}
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-accent-foreground/80">
            Longest streak this year. Two days from your record.
          </p>
        </div>

        {/* Daily goal */}
        <div className="col-span-12 md:col-span-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Today's page</SectionLabel>
            <Target className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-4 flex items-center gap-6">
            <RingGauge value={goalPct} />
            <div>
              <div className="font-display text-3xl italic">{currentBook.wordsToday.toLocaleString()}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                of {currentBook.dailyGoal.toLocaleString()} words
              </div>
              <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">+15% vs yesterday</div>
            </div>
          </div>
        </div>

        {/* Current chapter */}
        <div className="col-span-12 md:col-span-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Current chapter</SectionLabel>
            <BookOpen className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Chapter {activeChapter.number}</div>
          <div className="mt-1 font-display text-2xl italic leading-tight">{activeChapter.title}</div>
          <p className="mt-3 line-clamp-2 font-serif text-sm text-muted-foreground">
            {activeChapter.summary}
          </p>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-foreground/5">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.round((activeChapter.wordCount / activeChapter.target) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{activeChapter.wordCount} / {activeChapter.target} words</span>
            <span>{activeChapter.status}</span>
          </div>
        </div>

        {/* Recent books */}
        <div className="col-span-12 lg:col-span-8 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent projects</SectionLabel>
            <Link to="/books" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              All books <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((b) => (
              <Link
                key={b.id}
                to="/write"
                className="group flex gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:border-accent/30"
              >
                <div className="grid h-20 w-14 shrink-0 place-items-center rounded-sm bg-accent/10 font-display text-lg italic text-accent">
                  {b.cover}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-base font-semibold">{b.title}</div>
                  <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {b.genre} · {b.status}
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-foreground/5">
                    <div className="h-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{Math.round(b.progress * 100)}%</span>
                    <span>{b.lastEdited}</span>
                  </div>
                </div>
              </Link>
            ))}
            <Link
              to="/books/new"
              className="grid place-items-center rounded-xl border border-dashed border-border p-4 text-muted-foreground hover:border-accent/40 hover:text-accent"
            >
              <div className="text-center">
                <Plus className="mx-auto size-5" />
                <div className="mt-2 text-xs">New book</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Activity */}
        <div className="col-span-12 lg:col-span-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <SectionLabel>Recent activity</SectionLabel>
            <MessagesSquare className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-4 space-y-4">
            {timelineEvents.slice(0, 5).map((e, i) => (
              <div key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 size-2 rounded-full bg-accent" />
                  {i < 4 && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="flex-1 pb-2">
                  <div className="font-serif text-sm">{e.title}</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Ch. {e.chapter} · {e.year}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RingGauge({ value }: { value: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" className="fill-foreground font-mono text-[11px] font-bold">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

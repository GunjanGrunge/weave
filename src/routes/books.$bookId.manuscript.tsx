import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  MessageSquareText,
  Printer,
  RefreshCw,
} from "lucide-react";

import { BookTools } from "@/components/book/BookTools";
import { Button } from "@/components/ui/button";
import { manuscriptQueryKey, useManuscript, type ManuscriptChapter } from "@/lib/manuscript";

export const Route = createFileRoute("/books/$bookId/manuscript")({
  head: () => ({
    meta: [
      { title: "Manuscript - Story Platform" },
      {
        name: "description",
        content: "Read and prepare an ordered book manuscript for export.",
      },
    ],
  }),
  component: ManuscriptRoute,
});

function ManuscriptRoute() {
  const { bookId } = Route.useParams();
  return <ManuscriptPage bookId={bookId} />;
}

function pageEstimate(wordCount: number): number {
  return wordCount === 0 ? 0 : Math.ceil(wordCount / 250);
}

function chapterAnchor(chapter: ManuscriptChapter): string {
  return `chapter-${chapter.chapterId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function proseParagraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export function ManuscriptPage({ bookId }: { bookId: string }) {
  const manuscriptQuery = useManuscript(bookId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (manuscriptQuery.isPending) {
    return (
      <div className="grid min-h-full place-items-center">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Preparing manuscript
        </p>
      </div>
    );
  }

  if (manuscriptQuery.isError || !manuscriptQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/books" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Back to books
        </Link>
        <div className="mt-8 border-y border-border py-10">
          <h1 className="font-display text-3xl italic">Manuscript unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {manuscriptQuery.error instanceof Error
              ? manuscriptQuery.error.message
              : "Could not load this manuscript."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => void manuscriptQuery.refetch()}
          >
            <RefreshCw className="size-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const manuscript = manuscriptQuery.data;
  const acceptedChapters = manuscript.chapters.filter((chapter) => chapter.scenes.length > 0);

  return (
    <div data-manuscript-preview className="min-h-full bg-muted/30">
      <header
        data-print-hide
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
            <Button type="button" variant="ghost" size="icon" asChild>
              <Link to="/books/$bookId/chat" params={{ bookId }} aria-label="Back to Book Chat">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{manuscript.title}</h1>
              <p className="text-xs text-muted-foreground">
                {manuscript.wordCount.toLocaleString()} words ·{" "}
                {pageEstimate(manuscript.wordCount).toLocaleString()} estimated pages
              </p>
            </div>
          </div>

          <div className="flex w-full max-w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/books/$bookId/chat" params={{ bookId }}>
                <MessageSquareText className="size-4" />
                Chat
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/books/$bookId/vision" params={{ bookId }}>
                <Eye className="size-4" />
                Vision
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
            <BookTools
              bookId={bookId}
              onDeleted={() => {
                void queryClient
                  .invalidateQueries({ queryKey: ["books"] })
                  .finally(() => navigate({ to: "/books" }));
              }}
              onRestored={() => {
                void queryClient.invalidateQueries({ queryKey: manuscriptQueryKey(bookId) });
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[13rem_minmax(0,44rem)] lg:justify-center lg:py-8">
        <aside data-print-hide className="lg:sticky lg:top-28 lg:h-fit">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contents
          </p>
          <nav className="mt-3 border-l border-border" aria-label="Manuscript chapters">
            {acceptedChapters.length > 0 ? (
              acceptedChapters.map((chapter) => (
                <a
                  key={chapter.chapterId}
                  href={`#${chapterAnchor(chapter)}`}
                  className="block border-l-2 border-transparent px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  <span className="block font-medium text-foreground">{chapter.title}</span>
                </a>
              ))
            ) : (
              <p className="px-4 text-sm leading-6 text-muted-foreground">
                Accepted chapters will appear here.
              </p>
            )}
          </nav>
        </aside>

        <main className="manuscript-sheet min-w-0 border border-border bg-paper text-ink shadow-sm">
          {acceptedChapters.length === 0 ? (
            <section className="grid min-h-96 place-items-center px-8 py-16 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto size-6 text-warm" />
                <h2 className="mt-4 font-display text-2xl italic">No accepted prose yet</h2>
                <p className="mt-3 text-sm leading-6 text-ink/65">
                  Generated candidates stay in Chat until you accept them. Accepted scenes will
                  appear here in chapter order and in your exports.
                </p>
                <Button type="button" className="mt-6" asChild>
                  <Link to="/books/$bookId/chat" params={{ bookId }}>
                    Return to Book Chat
                  </Link>
                </Button>
              </div>
            </section>
          ) : (
            acceptedChapters.map((chapter) => (
              <article
                key={chapter.chapterId}
                id={chapterAnchor(chapter)}
                className="scroll-mt-28 border-b border-ink/10 px-7 py-12 last:border-b-0 sm:px-16 sm:py-14"
              >
                <header className="mb-10 text-center sm:mb-12">
                  <h2 className="font-serif text-2xl font-semibold">{chapter.title}</h2>
                </header>

                <div className="mx-auto max-w-[34rem]">
                  {chapter.scenes.map((scene, sceneIndex) => (
                    <section
                      key={scene.sceneId}
                      className="manuscript-scene font-serif text-[1.05rem] leading-[1.75] text-ink"
                      aria-label={`${chapter.title}, scene ${sceneIndex + 1}`}
                    >
                      {sceneIndex > 0 ? (
                        <div className="manuscript-scene-break" aria-hidden="true">
                          * * *
                        </div>
                      ) : null}
                      {proseParagraphs(scene.text).map((paragraph, paragraphIndex) => (
                        <p key={`${scene.sceneId}-${paragraphIndex}`}>{paragraph}</p>
                      ))}
                    </section>
                  ))}
                </div>
              </article>
            ))
          )}
        </main>
      </div>
    </div>
  );
}

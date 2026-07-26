import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "../components/layout/AppShell";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { RouteGuard } from "../lib/route-guard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// No `shellComponent` here on purpose: this app is deployed as a plain
// client-rendered SPA (see vite.spa.config.ts + src/spa.tsx's createRoot
// call), not TanStack Start's document-level SSR. A `shellComponent`
// rendering <html>/<head>/<body> still executes even in that CSR path
// (TanStack Router wraps the root route's children in it unconditionally),
// nesting a second <html> document inside the real one's #root div — that
// mismatch between the fiber tree and the actual DOM deadlocked React's
// event-target-to-fiber lookup and froze the entire app on load (commit
// f7d5197 "Fix SPA boot deadlock"). The <head> tags this used to render
// (stylesheet, favicon, fonts) are generated directly into the static
// index.html by scripts/write-static-index.mjs instead.
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Story Platform — AI Writing Workspace for Authors" },
      {
        name: "description",
        content:
          "A premium AI-first workspace for planning, drafting, refactoring, and publishing books.",
      },
      { name: "author", content: "Story Platform" },
      { property: "og:title", content: "Story Platform — AI Writing Workspace" },
      {
        property: "og:description",
        content:
          "Draft, plan, and publish books with an AI co-author. Story Refactor, consistency checks, and a distraction-free manuscript editor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// /login has no AppShell/RouteGuard (it's the one route reachable while
// signed out), but it still needs auth state to bounce an already-signed-in
// visitor back to the workspace rather than showing the form again.
export function LoginRouteShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/" });
    }
  }, [loading, user, navigate]);

  if (loading || user) {
    return null;
  }

  return <Outlet />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("story:theme");
      document.documentElement.classList.toggle("dark", stored === "dark");
    } catch {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isLoginRoute ? (
          <LoginRouteShell />
        ) : (
          <RouteGuard>
            <AppShell>
              <Outlet />
            </AppShell>
          </RouteGuard>
        )}
      </AuthProvider>
    </QueryClientProvider>
  );
}

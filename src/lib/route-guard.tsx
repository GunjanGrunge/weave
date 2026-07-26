import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

const PUBLIC_PATHS = new Set(["/login"]);

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublicPath) {
      navigate({ to: "/login" });
    }
  }, [loading, user, isPublicPath, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user && !isPublicPath) {
    // Redirect is in flight (see effect above); render nothing to avoid a
    // flash of protected content.
    return null;
  }

  return <>{children}</>;
}

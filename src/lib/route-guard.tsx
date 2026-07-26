import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

// __root.tsx never mounts RouteGuard for /login (see LoginRouteShell there),
// so every route rendered here is protected by definition — no public-path
// exemption needed.
export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    // Redirect is in flight (see effect above); render nothing to avoid a
    // flash of protected content.
    return null;
  }

  return <>{children}</>;
}

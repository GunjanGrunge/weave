import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun, UserRound } from "lucide-react";

import { SectionLabel } from "@/components/common/SectionLabel";
import { useAuth } from "@/lib/auth-context";
import { setDarkTheme, useDarkTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings - Story Platform" },
      { name: "description", content: "Manage your account and workspace appearance." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const dark = useDarkTheme();

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Workspace</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Settings</h1>
      </header>

      <section className="grid gap-4 border-b border-border py-7 sm:grid-cols-[180px_1fr]">
        <div>
          <h2 className="text-sm font-semibold">Writer account</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The Firebase account currently protecting this workspace.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4">
          <div className="grid size-9 place-items-center rounded-md bg-accent/10 text-accent">
            <UserRound className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.email ?? "Signed-in writer"}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              Private account
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 py-7 sm:grid-cols-[180px_1fr]">
        <div>
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Stored locally for this browser.
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-1 rounded-md border border-border bg-card p-1"
          aria-label="Theme"
        >
          <button
            type="button"
            onClick={() => setDarkTheme(false)}
            aria-pressed={!dark}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-sm text-sm",
              !dark ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <Sun className="size-4" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setDarkTheme(true)}
            aria-pressed={dark}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-sm text-sm",
              dark ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <Moon className="size-4" />
            Dark
          </button>
        </div>
      </section>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SectionLabel } from "@/components/common/SectionLabel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Story Platform" },
      { name: "description", content: "Appearance, AI preferences, and keyboard shortcuts." },
      { property: "og:title", content: "Settings · Story Platform" },
      { property: "og:description", content: "Tune the workspace to your writing rhythm." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function setTheme(v: boolean) {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    try {
      localStorage.setItem("story:theme", v ? "dark" : "light");
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-reveal px-6 py-10 lg:px-10">
      <header className="border-b border-border pb-6">
        <SectionLabel>Preferences</SectionLabel>
        <h1 className="mt-2 font-display text-4xl italic">Settings</h1>
      </header>

      <div className="mt-8 space-y-6">
        <Panel title="Profile">
          <Row label="Name" value="Not set" />
          <Row label="Handle" value="Not set" />
          <Row label="Timezone" value="Not set" />
        </Panel>

        <Panel title="Appearance">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-serif text-sm">Theme</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Light for daylight drafts, dark for late nights.
              </div>
            </div>
            <div className="flex rounded-full border border-border bg-background p-0.5">
              <button
                onClick={() => setTheme(false)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  !dark && "bg-accent text-accent-foreground",
                )}
              >
                Light
              </button>
              <button
                onClick={() => setTheme(true)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  dark && "bg-accent text-accent-foreground",
                )}
              >
                Dark
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="AI preferences">
          <Row label="Model" value="Balanced (recommended)" />
          <Row label="Voice mirroring" value="Aggressive" />
          <Row label="Suggestion frequency" value="Every 3 paragraphs" />
        </Panel>

        <Panel title="Keyboard shortcuts">
          <ShortcutRow k="⌘ K" label="Open command palette" />
          <ShortcutRow k="⌘ /" label="Ask assistant" />
          <ShortcutRow k="⌘ ⇧ R" label="Story Refactor" />
          <ShortcutRow k="⌘ ⇧ D" label="Toggle dark mode" />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-serif text-sm">{value}</div>
    </div>
  );
}

function ShortcutRow({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <kbd className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px]">
        {k}
      </kbd>
    </div>
  );
}

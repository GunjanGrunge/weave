import { useEffect, useState } from "react";
import { Menu, PanelLeft, Search, Bell, Moon, Sun } from "lucide-react";
import { currentBook, notifications } from "@/lib/mock-data";
import { UserMenu } from "./UserMenu";

export function TopBar({
  onToggleSidebar,
  onOpenMobileSidebar,
}: {
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}) {
  const [dark, setDark] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("story:theme", next ? "dark" : "light");
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }

  return (
    <header className="grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenMobileSidebar}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 lg:inline-flex"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-sm font-medium">{currentBook.title}</h1>
        <div className="hidden h-4 w-px shrink-0 bg-border sm:block" />
        <div className="hidden shrink-0 items-center gap-1.5 rounded-full bg-foreground/5 px-2 py-0.5 sm:inline-flex">
          <span className="relative size-1.5 rounded-full bg-muted-foreground/50" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Idle
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 lg:gap-5">
        <div className="hidden flex-col items-end md:flex">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {currentBook.wordCount.toLocaleString()} / {currentBook.wordGoal.toLocaleString()} words
          </span>
          <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-foreground/5">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.round(currentBook.progress * 100)}%` }}
            />
          </div>
        </div>

        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5"
          aria-label="Search"
        >
          <Search className="size-4" />
        </button>

        <div className="relative">
          <button
            className="relative rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5"
            onClick={() => setNotifOpen((o) => !o)}
            aria-label="Notifications"
          >
            <Bell className="size-4" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />
            )}
          </button>
          {notifOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}>
              <div
                className="absolute right-4 top-14 z-50 w-72 rounded-xl border border-border bg-card p-2 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Notifications
                </div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-foreground/5"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="flex-1">
                      <div className="text-xs">{n.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {n.time} ago
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No notifications.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        <UserMenu />
      </div>
    </header>
  );
}

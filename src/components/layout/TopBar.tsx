import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Menu, Moon, PanelLeft, Sun } from "lucide-react";

import { UserMenu } from "./UserMenu";

function pageLabel(pathname: string): string {
  if (pathname === "/") return "Workspace";
  if (pathname === "/books" || pathname === "/books/") return "My Books";
  if (pathname === "/books/new") return "New Book";
  if (pathname.endsWith("/vision")) return "Book Vision";
  if (pathname.endsWith("/chat")) return "Book Chat";
  if (pathname === "/settings") return "Settings";
  return "Story Platform";
}

export function TopBar({
  onToggleSidebar,
  onOpenMobileSidebar,
}: {
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [dark, setDark] = useState(false);

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
      // Theme persistence is optional in restricted browser contexts.
    }
  }

  return (
    <header className="grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 lg:inline-flex"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <h1 className="truncate text-sm font-medium">{pageLabel(pathname)}</h1>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5"
          onClick={toggleTheme}
          aria-label={dark ? "Use light theme" : "Use dark theme"}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

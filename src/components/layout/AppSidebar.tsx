import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookMarked,
  BookOpenText,
  Eye,
  History,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  Settings,
  UsersRound,
  X,
} from "lucide-react";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const workspaceItems: Item[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/books", label: "My Books", icon: BookMarked },
  { to: "/books/new", label: "New Book", icon: Plus },
];

const bookTools = [
  { segment: "chat", label: "Chat", icon: MessageSquareText },
  { segment: "manuscript", label: "Manuscript", icon: BookOpenText },
  { segment: "story-bible", label: "Story Bible", icon: UsersRound },
  { segment: "vision", label: "Vision", icon: Eye },
  { segment: "manuscript?panel=versions", label: "Versions", icon: History },
  { segment: "insights", label: "Insights", icon: BarChart3 },
];

export function AppSidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showLabels = mobileOpen || !collapsed;
  const bookMatch = pathname.match(/^\/books\/([^/]+)\/[^/]+/);
  const activeBookId = bookMatch?.[1];

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300",
          "md:static md:z-auto",
          collapsed ? "md:w-16" : "md:w-64",
          mobileOpen ? "w-72 translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent font-display text-lg italic text-accent-foreground">
              W
            </span>
            {showLabels && (
              <span className="truncate text-sm font-semibold tracking-tight">WEAVE</span>
            )}
          </Link>
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 md:hidden"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="mt-2">
            {showLabels && (
              <div className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Workspace
              </div>
            )}
            <div className="space-y-0.5">
              {workspaceItems.map((item) => {
                const active =
                  item.to === "/"
                    ? pathname === "/"
                    : pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                    title={showLabels ? undefined : item.label}
                  >
                    <Icon className="size-4 shrink-0" />
                    {showLabels && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            {showLabels && (
              <div className="mb-1.5 flex items-center justify-between px-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Book tools
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {activeBookId ? "Active" : "Open a book"}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {bookTools.map((item) => {
                const Icon = item.icon;
                const baseSegment = item.segment.split("?")[0];
                const versionsOpen =
                  new URLSearchParams(window.location.search).get("panel") === "versions";
                const active = Boolean(
                  activeBookId &&
                  pathname === `/books/${activeBookId}/${baseSegment}` &&
                  (item.label === "Versions" ? versionsOpen : !versionsOpen),
                );
                if (!activeBookId) {
                  return (
                    <span
                      key={item.segment}
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground/40"
                      title={showLabels ? undefined : `${item.label} - open a book first`}
                    >
                      <Icon className="size-4 shrink-0" />
                      {showLabels && <span className="truncate">{item.label}</span>}
                    </span>
                  );
                }
                const href = `/books/${encodeURIComponent(activeBookId)}/${item.segment}`;
                return (
                  <a
                    key={item.segment}
                    href={href}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                    )}
                    title={showLabels ? undefined : item.label}
                  >
                    <Icon className="size-4 shrink-0" />
                    {showLabels && <span className="truncate">{item.label}</span>}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <Link
              to="/settings"
              onClick={onCloseMobile}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                pathname === "/settings"
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
              title={showLabels ? undefined : "Settings"}
            >
              <Settings className="size-4 shrink-0" />
              {showLabels && <span className="truncate">Settings</span>}
            </Link>
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/10 font-mono text-[10px] font-bold text-foreground">
              W
            </div>
            {showLabels && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">WEAVE</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Workspace
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

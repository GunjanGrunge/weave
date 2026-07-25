import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookMarked,
  PenLine,
  Users,
  Globe2,
  ListOrdered,
  StickyNote,
  Compass,
  MessagesSquare,
  GitBranch,
  ShieldCheck,
  BookOpenCheck,
  Settings,
  Clock,
  X,
} from "lucide-react";

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const sections: Array<{ heading: string; items: Item[] }> = [
  {
    heading: "Workspace",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/books", label: "My Books", icon: BookMarked },
      { to: "/write", label: "Writing Studio", icon: PenLine },
      { to: "/chapters", label: "Chapters", icon: ListOrdered },
    ],
  },
  {
    heading: "Planning",
    items: [
      { to: "/characters", label: "Characters", icon: Users },
      { to: "/world", label: "World Building", icon: Globe2 },
      { to: "/timeline", label: "Timeline", icon: Clock },
      { to: "/notes", label: "Notes", icon: StickyNote },
      { to: "/research", label: "Research", icon: Compass },
    ],
  },
  {
    heading: "AI",
    items: [
      { to: "/chat", label: "AI Chat", icon: MessagesSquare },
      { to: "/refactor", label: "Story Refactor", icon: GitBranch },
      { to: "/consistency", label: "Consistency", icon: ShieldCheck },
    ],
  },
  {
    heading: "Production",
    items: [
      { to: "/publishing", label: "Publishing", icon: BookOpenCheck },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
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

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-300",
          "lg:static lg:z-auto",
          collapsed ? "lg:w-16" : "lg:w-64",
          mobileOpen ? "w-72 translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent font-display text-lg italic text-accent-foreground">
              S
            </span>
            {!collapsed && (
              <span className="truncate text-sm font-semibold tracking-tight">
                Story Platform
              </span>
            )}
          </Link>
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-foreground/5 lg:hidden"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.heading} className="mt-4 first:mt-2">
              {!collapsed && (
                <div className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {section.heading}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    item.to === "/"
                      ? pathname === "/"
                      : pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent/10 text-accent font-medium"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/10 font-mono text-[10px] font-bold text-foreground">
              ET
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">Elias Thorne</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Pro Author
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
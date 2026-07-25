import { cn } from "@/lib/utils";

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground", className)}>
      {children}
    </div>
  );
}
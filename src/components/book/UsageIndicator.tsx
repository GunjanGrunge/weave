import { Activity } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { subscribeBookUsage, type UsageSummary } from "@/lib/usage";

type UsageState =
  | { status: "loading" }
  | { status: "ready"; summary: UsageSummary }
  | { status: "error" };

function compactTokens(tokens: number): string {
  if (tokens < 1_000) {
    return tokens.toLocaleString("en-US");
  }

  const divisor = tokens < 1_000_000 ? 1_000 : 1_000_000;
  const suffix = tokens < 1_000_000 ? "k" : "m";
  const compact = (tokens / divisor).toFixed(tokens % divisor === 0 ? 0 : 1);
  return `${compact.replace(/\.0$/, "")}${suffix}`;
}

export function UsageIndicator({ bookId }: { bookId: string }) {
  const requestVersionRef = useRef(0);
  const [state, setState] = useState<UsageState>({ status: "loading" });

  useEffect(() => {
    requestVersionRef.current += 1;
    const requestVersion = requestVersionRef.current;
    setState({ status: "loading" });

    const unsubscribe = subscribeBookUsage(
      bookId,
      (summary) => {
        if (requestVersionRef.current === requestVersion) {
          setState({ status: "ready", summary });
        }
      },
      () => {
        if (requestVersionRef.current === requestVersion) {
          setState({ status: "error" });
        }
      },
    );

    return () => {
      requestVersionRef.current += 1;
      unsubscribe();
    };
  }, [bookId]);

  let visibleText = "Usage...";
  let accessibleText = "Loading AI usage for this book";

  if (state.status === "error") {
    visibleText = "Usage unavailable";
    accessibleText = visibleText;
  } else if (state.status === "ready") {
    const { callCount, totalTokens } = state.summary;
    visibleText = `${callCount} ${callCount === 1 ? "call" : "calls"} · ${compactTokens(totalTokens)} tokens`;
    accessibleText = `${callCount} AI ${callCount === 1 ? "call" : "calls"}, ${totalTokens.toLocaleString("en-US")} tokens used for this book`;
  }

  return (
    <span
      role="status"
      aria-label={accessibleText}
      title={accessibleText}
      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground"
    >
      <Activity className="size-3.5" aria-hidden="true" />
      {visibleText}
    </span>
  );
}

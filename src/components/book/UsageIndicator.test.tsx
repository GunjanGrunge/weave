import "@testing-library/jest-dom/vitest";

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UsageSummary } from "@/lib/usage";

const { subscribeMock } = vi.hoisted(() => ({ subscribeMock: vi.fn() }));

vi.mock("@/lib/usage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/usage")>("@/lib/usage");
  return { ...actual, subscribeBookUsage: subscribeMock };
});

import { UsageIndicator } from "./UsageIndicator";

type Subscription = {
  bookId: string;
  next: (summary: UsageSummary) => void;
  error: () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

describe("UsageIndicator", () => {
  const subscriptions: Subscription[] = [];

  beforeEach(() => {
    subscriptions.length = 0;
    subscribeMock.mockReset().mockImplementation((bookId, next, error) => {
      const unsubscribe = vi.fn();
      subscriptions.push({ bookId, next, error, unsubscribe });
      return unsubscribe;
    });
  });

  it("shows loading, zero usage, live updates, and an exact accessible total", () => {
    render(<UsageIndicator bookId="book-1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Usage");

    act(() =>
      subscriptions[0].next({
        callCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("0 calls");
    expect(screen.getByRole("status")).toHaveTextContent("0 tokens");

    act(() =>
      subscriptions[0].next({
        callCount: 3,
        inputTokens: 10_000,
        outputTokens: 2_400,
        totalTokens: 12_400,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 calls");
    expect(screen.getByRole("status")).toHaveTextContent("12.4k tokens");
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "3 AI calls, 12,400 tokens used for this book",
    );
  });

  it("degrades to a non-blocking unavailable state", () => {
    render(<UsageIndicator bookId="book-1" />);
    act(() => subscriptions[0].error());
    expect(screen.getByRole("status")).toHaveTextContent("Usage unavailable");
  });

  it("formats token boundaries without resizing its stable status surface", () => {
    render(<UsageIndicator bookId="book-1" />);

    act(() =>
      subscriptions[0].next({
        callCount: 1,
        inputTokens: 900,
        outputTokens: 99,
        totalTokens: 999,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 call · 999 tokens");
    expect(screen.getByRole("status")).toHaveClass("min-h-8", "shrink-0");

    act(() =>
      subscriptions[0].next({
        callCount: 2,
        inputTokens: 1_000_000,
        outputTokens: 200_000,
        totalTokens: 1_200_000,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 calls · 1.2m tokens");
  });

  it("unsubscribes and ignores stale callbacks across A to B to A navigation", () => {
    const { rerender } = render(<UsageIndicator bookId="book-a" />);
    rerender(<UsageIndicator bookId="book-b" />);
    rerender(<UsageIndicator bookId="book-a" />);

    expect(subscriptions.map(({ bookId }) => bookId)).toEqual(["book-a", "book-b", "book-a"]);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1);

    act(() =>
      subscriptions[2].next({
        callCount: 2,
        inputTokens: 1_000,
        outputTokens: 1_000,
        totalTokens: 2_000,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 calls");
    act(() =>
      subscriptions[0].next({
        callCount: 99,
        inputTokens: 50_000,
        outputTokens: 49_000,
        totalTokens: 99_000,
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 calls");
    expect(screen.getByRole("status")).not.toHaveTextContent("99 calls");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(<UsageIndicator bookId="book-1" />);
    unmount();
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });
});

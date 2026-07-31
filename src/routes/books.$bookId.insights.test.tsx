import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeMock } = vi.hoisted(() => ({ subscribeMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as object),
    useParams: () => ({ bookId: "book-1" }),
  }),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; params?: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/usage", () => ({
  subscribeBookUsage: subscribeMock,
}));

import { InsightsPage } from "./books.$bookId.insights";

describe("InsightsPage", () => {
  let emit: (summary: unknown) => void;

  beforeEach(() => {
    subscribeMock.mockReset();
    subscribeMock.mockImplementation((_bookId: string, onChange: (summary: unknown) => void) => {
      emit = onChange;
      return vi.fn();
    });
  });

  it("renders live call and token distribution data", async () => {
    render(<InsightsPage bookId="book-1" />);
    act(() => {
      emit({ callCount: 4, inputTokens: 3000, outputTokens: 1000, totalTokens: 4000 });
    });

    expect(await screen.findByText("4,000")).toBeInTheDocument();
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
    expect(screen.getAllByText(/1,000/)).toHaveLength(2);
    expect(screen.getByText(/\(75%\)/)).toBeInTheDocument();
  });

  it("shows an actionable zero state", async () => {
    render(<InsightsPage bookId="book-1" />);
    act(() => {
      emit({ callCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    });

    expect(await screen.findByText(/usage will appear/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start in chat/i })).toBeInTheDocument();
  });
});

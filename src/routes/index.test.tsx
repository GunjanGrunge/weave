import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useBooksMock } = vi.hoisted(() => ({
  useBooksMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: { bookId?: string };
  }) => (
    <a href={params?.bookId ? to.replace("$bookId", params.bookId) : to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/books", () => ({
  useBooks: useBooksMock,
  formatBookDate: () => "Jul 27, 2026",
}));

vi.mock("@/lib/health", () => ({
  checkBackendHealth: () => new Promise(() => {}),
}));

import { Dashboard } from "./index";

describe("Dashboard", () => {
  beforeEach(() => useBooksMock.mockReset());

  it("opens persisted books through their real chat routes", () => {
    useBooksMock.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [
        {
          bookId: "book-1",
          title: "The Floating Hotel",
          style: { presetIds: ["warm"] },
          createdAt: null,
        },
      ],
    });

    render(<Dashboard />);

    expect(screen.getByRole("link", { name: /the floating hotel/i })).toHaveAttribute(
      "href",
      "/books/book-1/chat",
    );
  });

  it("does not report zero books when the list request fails", () => {
    useBooksMock.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      data: undefined,
      refetch: vi.fn(),
    });

    render(<Dashboard />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

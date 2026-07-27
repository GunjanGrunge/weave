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

import { BooksPage } from "./books.index";

describe("BooksPage", () => {
  beforeEach(() => useBooksMock.mockReset());

  it("renders persisted books with links to their real chat routes", () => {
    useBooksMock.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [
        {
          bookId: "book-1",
          title: "The Floating Hotel",
          style: { presetIds: ["warm"] },
          createdAt: "2026-07-27T12:00:00.000Z",
        },
      ],
    });

    render(<BooksPage />);

    expect(screen.getByText("The Floating Hotel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /the floating hotel/i })).toHaveAttribute(
      "href",
      "/books/book-1/chat",
    );
  });

  it("renders a real empty state instead of demo books", () => {
    useBooksMock.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [],
    });

    render(<BooksPage />);

    expect(screen.getByText(/begin your first book/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});

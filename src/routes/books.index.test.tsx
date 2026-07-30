import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { deleteBookMock, useBooksMock } = vi.hoisted(() => ({
  deleteBookMock: vi.fn(),
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

vi.mock("@/lib/book-management", () => ({
  deleteBook: deleteBookMock,
}));

import { BooksPage } from "./books.index";

describe("BooksPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    deleteBookMock.mockReset().mockResolvedValue(undefined);
    useBooksMock.mockReset();
  });

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

  it("keeps cached books visible when a background refresh fails", () => {
    useBooksMock.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      data: [
        {
          bookId: "book-cached",
          title: "Cached Manuscript",
          style: { presetIds: ["warm"] },
          createdAt: null,
        },
      ],
      refetch: vi.fn(),
    });

    render(<BooksPage />);

    expect(screen.getByRole("link", { name: /cached manuscript/i })).toHaveAttribute(
      "href",
      "/books/book-cached/chat",
    );
  });

  it("permanently deletes a book from its card and shows completion", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
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
      refetch,
    });

    render(<BooksPage />);
    fireEvent.click(screen.getByRole("button", { name: /delete the floating hotel/i }));

    expect(screen.getByText(/completely erased from weave/i)).toBeInTheDocument();
    expect(screen.getByText(/all stored embeddings/i)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /permanently delete/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteBookMock).toHaveBeenCalledWith("book-1"));
    expect(refetch).toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(/all associated data/i);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/books";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => pathname,
  Link: ({
    children,
    to,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: () => void;
  }) => (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

import { AppSidebar } from "./AppSidebar";

describe("AppSidebar", () => {
  beforeEach(() => {
    pathname = "/books";
  });

  it("shows labels on mobile even when desktop navigation was collapsed", () => {
    render(<AppSidebar collapsed mobileOpen onCloseMobile={vi.fn()} />);

    expect(screen.getByText("My Books")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("closes the mobile drawer when the active destination is selected", () => {
    const onCloseMobile = vi.fn();
    render(<AppSidebar collapsed={false} mobileOpen onCloseMobile={onCloseMobile} />);

    fireEvent.click(screen.getByRole("link", { name: /my books/i }));

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("shows book tools as unavailable until a book is open", () => {
    render(<AppSidebar collapsed={false} mobileOpen={false} onCloseMobile={vi.fn()} />);

    expect(screen.getByText("Open a book")).toBeInTheDocument();
    expect(screen.getByText("Chat").closest("[aria-disabled='true']")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Insights" })).not.toBeInTheDocument();
  });

  it("links every production tool to the active book", () => {
    pathname = "/books/book-42/chat";
    render(<AppSidebar collapsed={false} mobileOpen={false} onCloseMobile={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Manuscript" })).toHaveAttribute(
      "href",
      "/books/book-42/manuscript",
    );
    expect(screen.getByRole("link", { name: "Versions" })).toHaveAttribute(
      "href",
      "/books/book-42/manuscript?panel=versions",
    );
    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute(
      "href",
      "/books/book-42/insights",
    );
  });
});

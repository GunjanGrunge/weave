import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/books",
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
});

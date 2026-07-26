import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const { navigateMock, useRouterStateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useRouterStateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: useRouterStateMock,
}));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock("./auth-context", () => ({
  useAuth: useAuthMock,
}));

import { RouteGuard } from "./route-guard";

function Protected() {
  return <div data-testid="protected-content">secret manuscript</div>;
}

describe("RouteGuard", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useRouterStateMock.mockReset();
  });

  it("shows a loading state and does not render children while auth is resolving", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });
    useRouterStateMock.mockReturnValue("/");

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated on a protected route", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    useRouterStateMock.mockReturnValue("/write");

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/login" }));
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("does not redirect when already on /login while unauthenticated", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    useRouterStateMock.mockReturnValue("/login");

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders children once authenticated", () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-a" } as User, loading: false });
    useRouterStateMock.mockReturnValue("/write");

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

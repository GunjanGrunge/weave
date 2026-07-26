import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
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
  });

  it("shows a loading state and does not render children while auth is resolving", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when unauthenticated", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/login" }));
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders children once authenticated", () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-a" } as User, loading: false });

    render(
      <RouteGuard>
        <Protected />
      </RouteGuard>,
    );

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

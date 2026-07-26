import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { ReactNode } from "react";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({}),
  useRouterState: () => "/login",
  Outlet: () => <div data-testid="login-outlet">login form</div>,
  Link: (props: { children?: ReactNode }) => <a>{props.children}</a>,
  createRootRouteWithContext: () => (options: unknown) => ({
    useRouteContext: () => ({ queryClient: undefined }),
    options,
  }),
}));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock("../lib/auth-context", () => ({
  useAuth: useAuthMock,
}));

import { LoginRouteShell } from "./__root";

describe("LoginRouteShell", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("renders the login form while unauthenticated", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<LoginRouteShell />);

    expect(screen.getByTestId("login-outlet")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders nothing while auth is resolving", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });

    render(<LoginRouteShell />);

    expect(screen.queryByTestId("login-outlet")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("redirects an already-authenticated user to / instead of showing the form", async () => {
    useAuthMock.mockReturnValue({ user: { uid: "user-a" } as User, loading: false });

    render(<LoginRouteShell />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/" }));
    expect(screen.queryByTestId("login-outlet")).not.toBeInTheDocument();
  });
});

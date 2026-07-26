import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return { ...actual, signOut: signOutMock };
});
vi.mock("@/lib/firebase", () => ({ auth: {} }));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: useAuthMock }));

import { UserMenu } from "./UserMenu";

describe("UserMenu", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
  });

  it("renders nothing when there is no signed-in user", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    const { container } = render(<UserMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("signs out when the sign-out control is activated", async () => {
    useAuthMock.mockReturnValue({
      user: { uid: "user-a", email: "writer@example.com" } as User,
      loading: false,
    });

    render(<UserMenu />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";

const { onAuthStateChangedMock, signOutMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    onAuthStateChanged: onAuthStateChangedMock,
    signOut: signOutMock,
  };
});

vi.mock("./firebase", () => ({
  auth: { currentUser: null },
}));

import { AuthProvider, useAuth } from "./auth-context";

function Probe() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider / useAuth", () => {
  beforeEach(() => {
    onAuthStateChangedMock.mockReset();
    signOutMock.mockReset();
  });

  it("starts in a loading state before Firebase resolves the initial auth state", () => {
    onAuthStateChangedMock.mockImplementation(() => () => {});

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("uid").textContent).toBe("none");
  });

  it("exposes the signed-in user once onAuthStateChanged fires and clears loading", async () => {
    const fakeUser = { uid: "user-a" } as User;
    onAuthStateChangedMock.mockImplementation((_auth, callback: (u: User | null) => void) => {
      callback(fakeUser);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("uid").textContent).toBe("user-a");
  });

  it("exposes null user once onAuthStateChanged fires with no user (signed out)", async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback: (u: User | null) => void) => {
      callback(null);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("uid").textContent).toBe("none");
  });

  it("unsubscribes from onAuthStateChanged on unmount", () => {
    const unsubscribe = vi.fn();
    onAuthStateChangedMock.mockImplementation(() => unsubscribe);

    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

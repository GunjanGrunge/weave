import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signInMock, signOutMock, authenticatedFetchMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
  authenticatedFetchMock: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    signInWithEmailAndPassword: signInMock,
    signOut: signOutMock,
  };
});

vi.mock("@/lib/firebase", () => ({
  auth: {},
}));

vi.mock("@/lib/api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import { LoginForm } from "./login";

describe("LoginForm", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signOutMock.mockReset();
    authenticatedFetchMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(new Response(JSON.stringify({ uid: "user-a" })));
  });

  it("signs in, verifies whoami, and calls onSuccess on submit", async () => {
    signInMock.mockResolvedValue({ user: { uid: "user-a" } });
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith(
        expect.anything(),
        "writer@example.com",
        "correct-horse",
      ),
    );
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledWith("/whoami"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("logs the verified uid as visible proof the auth chain worked", async () => {
    signInMock.mockResolvedValue({ user: { uid: "user-a" } });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(<LoginForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith("Signed in as uid:", "user-a"));
    consoleSpy.mockRestore();
  });

  it("shows a distinct message (not a credential error) when whoami can't be reached", async () => {
    signInMock.mockResolvedValue({ user: { uid: "user-a" } });
    authenticatedFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't verify/i));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("treats a malformed whoami body (e.g. the SPA fallback page) as unverified, not a pass", async () => {
    signInMock.mockResolvedValue({ user: { uid: "user-a" } });
    authenticatedFetchMock.mockResolvedValue(new Response("<!doctype html>", { status: 200 }));
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a clear inline error when sign-in fails", async () => {
    signInMock.mockRejectedValue({ code: "auth/invalid-credential", message: "bad creds" });

    render(<LoginForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("does not call onSuccess when whoami verification fails", async () => {
    signInMock.mockResolvedValue({ user: { uid: "user-a" } });
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "bad" }), { status: 401 }),
    );
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not render any signup or self-registration affordance", () => {
    render(<LoginForm onSuccess={vi.fn()} />);

    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument();
  });
});

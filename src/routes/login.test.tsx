import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    signInWithEmailAndPassword: signInMock,
  };
});

vi.mock("@/lib/firebase", () => ({
  auth: {},
}));

import { LoginForm } from "./login";

describe("LoginForm", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("calls signInWithEmailAndPassword with the entered credentials on submit", async () => {
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
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("shows a clear inline error when sign-in fails", async () => {
    signInMock.mockRejectedValue({ code: "auth/invalid-credential", message: "bad creds" });

    render(<LoginForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "writer@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("does not render any signup or self-registration affordance", () => {
    render(<LoginForm onSuccess={vi.fn()} />);

    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/register/i)).not.toBeInTheDocument();
  });
});

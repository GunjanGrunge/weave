import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: verifyIdTokenMock })),
}));

import { verifyIdToken, extractBearerToken, assertOwnership, AuthError } from "./auth.js";

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Authorization header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns undefined for a missing header", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it("returns undefined for a malformed header (no Bearer prefix)", () => {
    expect(extractBearerToken("abc123")).toBeUndefined();
  });
});

describe("verifyIdToken", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
  });

  it("resolves with the decoded token when the Authorization header carries a valid ID token", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const decoded = await verifyIdToken("Bearer valid-token");

    expect(decoded.uid).toBe("user-a");
    expect(verifyIdTokenMock).toHaveBeenCalledWith("valid-token");
  });

  it("rejects with AuthError when the Authorization header is missing", async () => {
    await expect(verifyIdToken(undefined)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyIdToken(undefined)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it("rejects with AuthError when the token is malformed (no Bearer prefix)", async () => {
    await expect(verifyIdToken("not-a-bearer-token")).rejects.toBeInstanceOf(AuthError);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it("rejects with AuthError when Admin SDK rejects the token as invalid/expired", async () => {
    verifyIdTokenMock.mockRejectedValue(new Error("Firebase ID token has expired"));

    await expect(verifyIdToken("Bearer expired-token")).rejects.toBeInstanceOf(AuthError);
    await expect(verifyIdToken("Bearer expired-token")).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("assertOwnership", () => {
  it("does not throw when the caller uid matches the resource uid (user A owns their own book)", () => {
    expect(() => assertOwnership("user-a", "user-a")).not.toThrow();
  });

  it("throws AuthError when the caller uid does not match the resource uid (user A requests user B's book)", () => {
    expect(() => assertOwnership("user-a", "user-b")).toThrow(AuthError);
  });
});

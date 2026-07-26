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
    expect(verifyIdTokenMock).toHaveBeenCalledWith("valid-token", true);
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
    const expired = Object.assign(new Error("Firebase ID token has expired"), {
      code: "auth/id-token-expired",
    });
    verifyIdTokenMock.mockRejectedValue(expired);

    await expect(verifyIdToken("Bearer expired-token")).rejects.toBeInstanceOf(AuthError);
    await expect(verifyIdToken("Bearer expired-token")).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects with AuthError when Admin SDK reports the token was revoked", async () => {
    const revoked = Object.assign(new Error("Firebase ID token has been revoked"), {
      code: "auth/id-token-revoked",
    });
    verifyIdTokenMock.mockRejectedValue(revoked);

    await expect(verifyIdToken("Bearer revoked-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("rethrows non-auth errors (e.g. network/infra failures) instead of misreporting them as unauthenticated", async () => {
    const networkFailure = new Error("fetch failed");
    verifyIdTokenMock.mockRejectedValue(networkFailure);

    await expect(verifyIdToken("Bearer some-token")).rejects.toBe(networkFailure);
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

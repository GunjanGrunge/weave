import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

import { buildWhoamiResponse } from "./whoami.js";
import { AuthError } from "../services/auth.js";

describe("buildWhoamiResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
  });

  it("returns 200 with the caller's uid when the Authorization header carries a valid token", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildWhoamiResponse("Bearer valid-token");

    expect(result).toEqual({ statusCode: 200, body: { uid: "user-a" } });
  });

  it("returns 401 with a {code,message} body when the token is missing", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Missing or malformed Authorization header."));

    const result = await buildWhoamiResponse(undefined);

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
    expect(typeof (result.body as { message: string }).message).toBe("string");
  });

  it("returns 401 when the token is invalid or expired", async () => {
    verifyIdTokenMock.mockRejectedValue(new AuthError("Invalid or expired ID token."));

    const result = await buildWhoamiResponse("Bearer garbage");

    expect(result.statusCode).toBe(401);
    expect(result.body).toMatchObject({ code: "unauthenticated" });
  });

  it("rethrows non-AuthError failures (e.g. infra errors) instead of reporting them as unauthenticated", async () => {
    const infraFailure = new Error("network unreachable");
    verifyIdTokenMock.mockRejectedValue(infraFailure);

    await expect(buildWhoamiResponse("Bearer some-token")).rejects.toBe(infraFailure);
  });
});

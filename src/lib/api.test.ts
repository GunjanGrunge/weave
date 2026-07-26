import { describe, it, expect, vi, beforeEach } from "vitest";

const { getIdTokenMock } = vi.hoisted(() => ({ getIdTokenMock: vi.fn() }));

vi.mock("./firebase", () => ({
  auth: {
    get currentUser() {
      return {
        getIdToken: getIdTokenMock,
      };
    },
  },
}));

import { authenticatedFetch, UnauthenticatedError } from "./api";

describe("authenticatedFetch", () => {
  beforeEach(() => {
    getIdTokenMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("attaches the current user's ID token as a Bearer Authorization header", async () => {
    getIdTokenMock.mockResolvedValue("fresh-id-token");
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await authenticatedFetch("/whoami");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/whoami"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-id-token" }),
      }),
    );
  });

  it("throws UnauthenticatedError when there is no signed-in user, without calling fetch", async () => {
    vi.doMock("./firebase", () => ({ auth: { currentUser: null } }));
    vi.resetModules();
    const { authenticatedFetch: authenticatedFetchNoUser, UnauthenticatedError: NoUserError } =
      await import("./api");

    await expect(authenticatedFetchNoUser("/whoami")).rejects.toBeInstanceOf(NoUserError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("UnauthenticatedError", () => {
  it("is an Error subclass", () => {
    expect(new UnauthenticatedError()).toBeInstanceOf(Error);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, assertOwnershipMock, getBookMock, getBookStyleStateMock } = vi.hoisted(
  () => ({
    verifyIdTokenMock: vi.fn(),
    assertOwnershipMock: vi.fn(),
    getBookMock: vi.fn(),
    getBookStyleStateMock: vi.fn(),
  }),
);

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return {
    ...actual,
    verifyIdToken: verifyIdTokenMock,
    assertOwnership: assertOwnershipMock,
  };
});
vi.mock("../services/books.js", () => ({ getBook: getBookMock }));
vi.mock("../services/styles.js", async () => {
  const actual =
    await vi.importActual<typeof import("../services/styles.js")>("../services/styles.js");
  return { ...actual, getBookStyleState: getBookStyleStateMock };
});

import { AuthError } from "../services/auth.js";
import { buildGetStyleConfigResponse } from "./getStyleConfig.js";

describe("buildGetStyleConfigResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    assertOwnershipMock.mockReset();
    getBookMock.mockReset();
    getBookStyleStateMock.mockReset();
  });

  it("returns the active catalog for authenticated intake without a book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    const result = await buildGetStyleConfigResponse("Bearer valid", {});

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      config: {
        defaultPresetId: "warm-character-driven",
        presets: expect.arrayContaining([
          expect.objectContaining({ id: "sparse-cinematic", active: true }),
        ]),
      },
      writingConfig: {
        genres: expect.arrayContaining([
          expect.objectContaining({ id: "fantasy", label: "Fantasy" }),
        ]),
        defaults: {
          genreProfile: { primaryGenre: "general-fiction" },
          voiceProfile: { pointOfView: "unspecified" },
        },
      },
    });
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns canonical owned-Book style and revision", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    getBookStyleStateMock.mockResolvedValue({
      style: { presetIds: ["sparse-cinematic"] },
      styleRevision: 4,
    });

    const result = await buildGetStyleConfigResponse("Bearer valid", {
      bookId: "book-1",
    });

    expect(assertOwnershipMock).toHaveBeenCalledWith("user-a", "user-a");
    expect(result).toMatchObject({
      statusCode: 200,
      body: {
        style: { presetIds: ["sparse-cinematic"] },
        styleRevision: 4,
      },
    });
  });

  it("returns 404 for a missing Book and 401 for auth/ownership failures", async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ uid: "user-a" });
    getBookMock.mockResolvedValueOnce(undefined);
    await expect(
      buildGetStyleConfigResponse("Bearer valid", { bookId: "missing" }),
    ).resolves.toMatchObject({ statusCode: 404 });

    verifyIdTokenMock.mockRejectedValueOnce(new AuthError("Invalid token."));
    await expect(buildGetStyleConfigResponse("Bearer bad", {})).resolves.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects malformed bookId", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    await expect(
      buildGetStyleConfigResponse("Bearer valid", { bookId: 42 }),
    ).resolves.toMatchObject({ statusCode: 400 });
  });
});

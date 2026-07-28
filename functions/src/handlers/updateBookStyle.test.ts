import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, assertOwnershipMock, getBookMock, updateBookStyleMock } = vi.hoisted(
  () => ({
    verifyIdTokenMock: vi.fn(),
    assertOwnershipMock: vi.fn(),
    getBookMock: vi.fn(),
    updateBookStyleMock: vi.fn(),
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
  return { ...actual, updateBookStyle: updateBookStyleMock };
});

import { AuthError } from "../services/auth.js";
import {
  StyleConflictError,
  StyleNotFoundError,
  StyleValidationError,
} from "../services/styles.js";
import { buildUpdateBookStyleResponse } from "./updateBookStyle.js";

const body = {
  bookId: "book-1",
  style: {
    presetIds: ["fast-paced-thriller", "sparse-cinematic"],
    customInstruction: "Keep dialogue dry.",
  },
  expectedRevision: 2,
};

describe("buildUpdateBookStyleResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    assertOwnershipMock.mockReset();
    getBookMock.mockReset();
    updateBookStyleMock.mockReset();
  });

  it("authenticates, enforces ownership, and delegates canonical persistence", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    updateBookStyleMock.mockResolvedValue({
      style: body.style,
      styleRevision: 3,
    });

    const result = await buildUpdateBookStyleResponse("Bearer valid", body);

    expect(assertOwnershipMock).toHaveBeenCalledWith("user-a", "user-a");
    expect(updateBookStyleMock).toHaveBeenCalledWith("book-1", body.style, 2);
    expect(result).toEqual({
      statusCode: 200,
      body: { style: body.style, styleRevision: 3 },
    });
  });

  it("maps canonical conflicts to 409", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    updateBookStyleMock.mockRejectedValue(
      new StyleConflictError({ presetIds: ["mythic-expansive"] }, 5),
    );

    await expect(buildUpdateBookStyleResponse("Bearer valid", body)).resolves.toEqual({
      statusCode: 409,
      body: {
        code: "conflict",
        message: "The Book Style changed in another session.",
        style: { presetIds: ["mythic-expansive"] },
        styleRevision: 5,
      },
    });
  });

  it("maps validation, missing Book, and authentication errors", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue({ uid: "user-a" });
    updateBookStyleMock.mockRejectedValueOnce(new StyleValidationError("Invalid Style."));
    await expect(buildUpdateBookStyleResponse("Bearer valid", body)).resolves.toMatchObject({
      statusCode: 400,
    });

    updateBookStyleMock.mockRejectedValueOnce(new StyleNotFoundError());
    await expect(buildUpdateBookStyleResponse("Bearer valid", body)).resolves.toMatchObject({
      statusCode: 404,
    });

    verifyIdTokenMock.mockRejectedValueOnce(new AuthError("Invalid token."));
    await expect(buildUpdateBookStyleResponse("Bearer bad", body)).resolves.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects malformed request bodies before persistence", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });

    await expect(
      buildUpdateBookStyleResponse("Bearer valid", {
        bookId: "",
        style: { presetIds: [] },
        expectedRevision: -1,
      }),
    ).resolves.toMatchObject({ statusCode: 400 });
    expect(updateBookStyleMock).not.toHaveBeenCalled();
  });
});

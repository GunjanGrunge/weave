import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, getBookMock, getVisionDocumentMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  getVisionDocumentMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  getVisionDocument: getVisionDocumentMock,
}));

import { buildGetVisionResponse } from "./getVision.js";
import { AuthError } from "../services/auth.js";

const book = { uid: "user-a", title: "A heist", style: { presetIds: ["warm"] } };
const vision = {
  theme: "Heist",
  premise: "One last job.",
  characterIntents: ["Mara"],
  structureMap: [],
  guidanceDial: "normal" as const,
  threads: [],
};

describe("buildGetVisionResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    getVisionDocumentMock.mockReset();
  });

  it("returns the owned book and vision document", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    getVisionDocumentMock.mockResolvedValue(vision);

    const result = await buildGetVisionResponse("Bearer valid", { bookId: "book-1" });

    expect(result).toMatchObject({
      statusCode: 200,
      body: {
        book: { bookId: "book-1", title: "A heist", style: { presetIds: ["warm"] } },
        vision,
        writingConfig: {
          genres: expect.arrayContaining([
            expect.objectContaining({ id: "fantasy", label: "Fantasy" }),
          ]),
        },
      },
    });
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildGetVisionResponse(undefined, { bookId: "book-1" });

    expect(result.statusCode).toBe(401);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildGetVisionResponse("Bearer valid", { bookId: "missing-book" });

    expect(result.statusCode).toBe(404);
    expect(getVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects a book owned by another user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue(book);

    const result = await buildGetVisionResponse("Bearer valid", { bookId: "book-1" });

    expect(result.statusCode).toBe(401);
    expect(getVisionDocumentMock).not.toHaveBeenCalled();
  });
});

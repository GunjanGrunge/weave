import { describe, it, expect, vi, beforeEach } from "vitest";

const { verifyIdTokenMock, getBookMock, updateVisionDocumentMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  updateVisionDocumentMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});

vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  updateVisionDocument: updateVisionDocumentMock,
}));

import { buildUpdateVisionResponse } from "./updateVision.js";
import { AuthError } from "../services/auth.js";

const book = { uid: "user-a", title: "A heist", style: { presetIds: ["warm"] } };
const visionPayload = {
  theme: "Heist",
  premise: "One last job.",
  characterIntents: ["Mara"],
  threads: [
    {
      surface: "A cracked watch",
      meaning: "Mara is running out of time",
      subtlety: "subtle",
      payoffIntent: "Reveal in the midpoint",
      status: "open",
    },
  ],
};

describe("buildUpdateVisionResponse", () => {
  beforeEach(() => {
    verifyIdTokenMock.mockReset();
    getBookMock.mockReset();
    updateVisionDocumentMock.mockReset();
  });

  it("updates only editable vision fields for the owning user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    updateVisionDocumentMock.mockImplementation(async (_bookId, patch) => ({
      ...patch,
      structureMap: [{ beat: "Opening Image", sceneRef: "scene-1" }],
      guidanceDial: "normal",
    }));

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: { ...visionPayload, structureMap: [{ beat: "Bad", sceneRef: "bad" }] },
    });

    expect(result.statusCode).toBe(200);
    expect(updateVisionDocumentMock).toHaveBeenCalledWith("book-1", {
      theme: "Heist",
      premise: "One last job.",
      characterIntents: ["Mara"],
      threads: [
        expect.objectContaining({
          id: expect.any(String),
          surface: "A cracked watch",
          meaning: "Mara is running out of time",
          subtlety: "subtle",
          payoffIntent: "Reveal in the midpoint",
          status: "open",
          appearances: [],
        }),
      ],
    });
    expect(JSON.stringify(updateVisionDocumentMock.mock.calls[0][1])).not.toContain("structureMap");
  });

  it("preserves supplied thread IDs and paid-off status", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    updateVisionDocumentMock.mockImplementation(async (_bookId, patch) => ({
      ...patch,
      structureMap: [],
      guidanceDial: "normal",
    }));

    await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: {
        ...visionPayload,
        threads: [{ ...visionPayload.threads[0], id: "thread-1", status: "paid_off" }],
      },
    });

    expect(updateVisionDocumentMock.mock.calls[0][1].threads[0]).toMatchObject({
      id: "thread-1",
      status: "paid_off",
    });
  });

  it("returns 401 for a missing token", async () => {
    verifyIdTokenMock.mockRejectedValue(
      new AuthError("Missing or malformed Authorization header."),
    );

    const result = await buildUpdateVisionResponse(undefined, {
      bookId: "book-1",
      vision: visionPayload,
    });

    expect(result.statusCode).toBe(401);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent book", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(undefined);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "missing-book",
      vision: visionPayload,
    });

    expect(result.statusCode).toBe(404);
    expect(updateVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects a book owned by another user", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue(book);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: visionPayload,
    });

    expect(result.statusCode).toBe(401);
    expect(updateVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed thread subtlety or status", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: {
        ...visionPayload,
        threads: [{ ...visionPayload.threads[0], subtlety: "loud" }],
      },
    });

    expect(result.statusCode).toBe(400);
  });

  it("checks ownership before validating the body, so a cross-owner request 401s without leaking validation errors", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-b" });
    getBookMock.mockResolvedValue(book);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: {
        ...visionPayload,
        threads: [{ ...visionPayload.threads[0], subtlety: "loud" }],
      },
    });

    expect(result.statusCode).toBe(401);
    expect(updateVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate thread ids in the same request", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: {
        ...visionPayload,
        threads: [
          { ...visionPayload.threads[0], id: "dup" },
          { ...visionPayload.threads[0], id: "dup" },
        ],
      },
    });

    expect(result.statusCode).toBe(400);
    expect(updateVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects a thread with a blank surface, meaning, or payoffIntent", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);

    const result = await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: {
        ...visionPayload,
        threads: [{ ...visionPayload.threads[0], surface: "   " }],
      },
    });

    expect(result.statusCode).toBe(400);
    expect(updateVisionDocumentMock).not.toHaveBeenCalled();
  });

  it("strips embedded newlines from a character intent instead of letting it split on the next save", async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: "user-a" });
    getBookMock.mockResolvedValue(book);
    updateVisionDocumentMock.mockResolvedValue({ ...book, ...visionPayload });

    await buildUpdateVisionResponse("Bearer valid", {
      bookId: "book-1",
      vision: { ...visionPayload, characterIntents: ["Mara\nthe engineer"] },
    });

    expect(updateVisionDocumentMock.mock.calls[0][1].characterIntents).toEqual([
      "Mara the engineer",
    ]);
  });
});

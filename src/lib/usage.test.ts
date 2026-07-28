import { beforeEach, describe, expect, it, vi } from "vitest";

const { collectionMock, onSnapshotMock } = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  onSnapshotMock: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  onSnapshot: onSnapshotMock,
}));

vi.mock("./firebase", () => ({ firestore: { name: "test-firestore" } }));

import { subscribeBookUsage, summarizeUsageDocuments } from "./usage";

describe("usage", () => {
  beforeEach(() => {
    collectionMock.mockReset().mockReturnValue("usage-collection");
    onSnapshotMock.mockReset().mockReturnValue(vi.fn());
  });

  it("summarizes calls and finite non-negative token counts", () => {
    expect(
      summarizeUsageDocuments([
        { inputTokens: 900, outputTokens: 100 },
        { inputTokens: 20, outputTokens: 30 },
        { inputTokens: -10, outputTokens: Number.NaN },
        { inputTokens: "40", outputTokens: undefined },
      ]),
    ).toEqual({
      callCount: 4,
      inputTokens: 920,
      outputTokens: 130,
      totalTokens: 1_050,
    });
  });

  it("returns an honest zero summary", () => {
    expect(summarizeUsageDocuments([])).toEqual({
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it("subscribes to the selected book's owner-scoped usage collection", () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    const unsubscribe = vi.fn();
    onSnapshotMock.mockReturnValue(unsubscribe);

    expect(subscribeBookUsage("book-7", onChange, onError)).toBe(unsubscribe);
    expect(collectionMock).toHaveBeenCalledWith(
      { name: "test-firestore" },
      "books",
      "book-7",
      "usage",
    );

    const [query, next, error] = onSnapshotMock.mock.calls[0];
    expect(query).toBe("usage-collection");
    next({
      docs: [
        { data: () => ({ inputTokens: 2, outputTokens: 3 }) },
        { data: () => ({ inputTokens: 5, outputTokens: 7 }) },
      ],
    });
    expect(onChange).toHaveBeenCalledWith({
      callCount: 2,
      inputTokens: 7,
      outputTokens: 10,
      totalTokens: 17,
    });
    error(new Error("permission denied"));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

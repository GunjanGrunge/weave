import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveMock, regenerateMock, revertMock, acceptMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  regenerateMock: vi.fn(),
  revertMock: vi.fn(),
  acceptMock: vi.fn(),
}));

vi.mock("@/lib/scene-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scene-api")>("@/lib/scene-api");
  return {
    ...actual,
    saveGeneratedScene: saveMock,
    regenerateScene: regenerateMock,
    revertGeneratedScene: revertMock,
    acceptScene: acceptMock,
  };
});

import { SceneConflictError, type ChatMessage, type SceneCandidate } from "@/lib/scene-api";
import { SceneReviewCard } from "./SceneReviewCard";

const message: ChatMessage = {
  id: "message-1",
  type: "assistant_scene",
  text: "Original prose.",
  order: 1,
  sessionId: "session-1",
  revision: 0,
  status: "active",
  provider: "openai",
  model: "gpt-test",
};

function candidate(overrides: Partial<SceneCandidate> = {}): SceneCandidate {
  return {
    sessionId: "session-1",
    messageId: "message-1",
    text: "Original prose.",
    revision: 0,
    status: "active",
    provider: "openai",
    model: "gpt-test",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SceneReviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves inline edits after the debounce and shows Saved", async () => {
    vi.useFakeTimers();
    saveMock.mockResolvedValue(candidate({ text: "Writer edit.", revision: 1 }));
    render(<SceneReviewCard bookId="book-1" message={message} />);

    fireEvent.change(screen.getByLabelText("Generated scene"), {
      target: { value: "Writer edit." },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(saveMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({ text: "Writer edit.", revision: 0 }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("coalesces edits made during an in-flight save onto the returned revision", async () => {
    vi.useFakeTimers();
    const first = deferred<SceneCandidate>();
    saveMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(candidate({ text: "Latest edit.", revision: 2 }));
    render(<SceneReviewCard bookId="book-1" message={message} />);

    fireEvent.change(screen.getByLabelText("Generated scene"), {
      target: { value: "First edit." },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.change(screen.getByLabelText("Generated scene"), {
      target: { value: "Latest edit." },
    });
    await act(async () => {
      first.resolve(candidate({ text: "First edit.", revision: 1 }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1]?.[1]).toMatchObject({
      text: "Latest edit.",
      revision: 1,
    });
  });

  it("keeps local prose visible on conflict until the writer reloads canonical state", async () => {
    vi.useFakeTimers();
    saveMock.mockRejectedValue(
      new SceneConflictError("Newer version.", candidate({ text: "Other tab edit.", revision: 3 })),
    );
    render(<SceneReviewCard bookId="book-1" message={message} />);

    fireEvent.change(screen.getByLabelText("Generated scene"), {
      target: { value: "My local edit." },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(screen.getByLabelText("Generated scene")).toHaveValue("My local edit.");
    expect(screen.getByText(/revision 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reload saved version" }));
    expect(screen.getByLabelText("Generated scene")).toHaveValue("Other tab edit.");
  });

  it("flushes pending prose before accepting and blocks a double accept", async () => {
    const accepted = deferred<SceneCandidate>();
    saveMock.mockResolvedValue(candidate({ text: "Latest prose.", revision: 1 }));
    acceptMock.mockReturnValue(accepted.promise);
    render(<SceneReviewCard bookId="book-1" message={message} />);
    fireEvent.change(screen.getByLabelText("Generated scene"), {
      target: { value: "Latest prose." },
    });

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(acceptMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.invocationCallOrder[0]).toBeLessThan(
      acceptMock.mock.invocationCallOrder[0] as number,
    );

    await act(async () => {
      accepted.resolve(
        candidate({
          text: "Latest prose.",
          revision: 1,
          status: "accepted",
          acceptedSceneId: "scene-1",
        }),
      );
    });
    expect(await screen.findByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByLabelText("Generated scene")).not.toBeInTheDocument();
  });

  it("compares a regenerated attempt and restores the prior one", async () => {
    regenerateMock.mockResolvedValue(
      candidate({
        text: "New generation.",
        revision: 1,
        previousAttempt: {
          text: "Original prose.",
          provider: "openai",
          model: "gpt-test",
        },
      }),
    );
    revertMock.mockResolvedValue(candidate({ text: "Original prose.", revision: 2 }));
    render(<SceneReviewCard bookId="book-1" message={message} />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByRole("button", { name: "Compare" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getAllByText("New generation.")).toHaveLength(2);
    expect(screen.getAllByText("Original prose.")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Restore prior attempt" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Generated scene")).toHaveValue("Original prose."),
    );
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });
});

import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, updateMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/styles", async () => {
  const actual = await vi.importActual<typeof import("@/lib/styles")>("@/lib/styles");
  return { ...actual, fetchStyleConfig: fetchMock, updateBookStyle: updateMock };
});

import { StyleConflictError } from "@/lib/styles";
import { StyleControl } from "./StyleControl";

const loaded = {
  presets: [
    {
      id: "warm-character-driven",
      label: "Warm & Character-Driven",
      description: "Human, intimate scenes.",
      active: true,
    },
    {
      id: "sparse-cinematic",
      label: "Sparse & Cinematic",
      description: "Lean scenes and crisp images.",
      active: true,
    },
    {
      id: "mythic-expansive",
      label: "Mythic & Expansive",
      description: "A broad register and spacious pacing.",
      active: true,
    },
    {
      id: "retired",
      label: "Retired",
      description: "No longer selectable.",
      active: false,
    },
  ],
  defaultPresetId: "warm-character-driven",
  style: { presetIds: ["warm-character-driven"] },
  styleRevision: 2,
};

describe("StyleControl", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(loaded);
    updateMock.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("loads the current style without blocking its trigger and hides inactive presets", async () => {
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));

    expect(screen.getByText(/loading style/i)).toBeInTheDocument();
    expect(await screen.findByText("Warm & Character-Driven")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("book-1");
  });

  it("shows a selected retired preset and lets the writer remove it", async () => {
    fetchMock.mockResolvedValue({
      ...loaded,
      style: { presetIds: ["retired"] },
    });
    updateMock.mockResolvedValue({
      style: { presetIds: ["warm-character-driven"] },
      styleRevision: 3,
    });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const retired = await screen.findByRole("button", { name: /retired/i });
    expect(retired).toHaveAttribute("aria-pressed", "true");

    vi.useFakeTimers();
    fireEvent.click(retired);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(updateMock).toHaveBeenCalledWith("book-1", { presetIds: [] }, 2);
  });

  it("debounces a style update and shows the saved state", async () => {
    updateMock.mockResolvedValue({
      style: { presetIds: ["warm-character-driven", "sparse-cinematic"] },
      styleRevision: 3,
    });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const sparseButton = await screen.findByRole("button", { name: /sparse & cinematic/i });
    vi.useFakeTimers();
    fireEvent.click(sparseButton);

    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(updateMock).toHaveBeenCalledWith(
      "book-1",
      { presetIds: ["warm-character-driven", "sparse-cinematic"] },
      2,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("coalesces edits made during an in-flight save onto the returned revision", async () => {
    let resolveFirst!: (value: {
      style: { presetIds: string[] };
      styleRevision: number;
    }) => void;
    updateMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        style: {
          presetIds: ["warm-character-driven", "sparse-cinematic"],
          customInstruction: "Keep it close.",
        },
        styleRevision: 4,
      });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const sparse = await screen.findByRole("button", { name: /sparse & cinematic/i });
    const instruction = screen.getByLabelText(/custom style instruction/i);
    vi.useFakeTimers();
    fireEvent.click(sparse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    fireEvent.change(instruction, { target: { value: "Keep it close." } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
      resolveFirst({
        style: { presetIds: ["warm-character-driven", "sparse-cinematic"] },
        styleRevision: 3,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenLastCalledWith(
      "book-1",
      {
        presetIds: ["warm-character-driven", "sparse-cinematic"],
        customInstruction: "Keep it close.",
      },
      3,
    );
  });

  it("offers reload and keep-mine actions after a revision conflict", async () => {
    updateMock.mockRejectedValueOnce(
      new StyleConflictError("Changed elsewhere.", {
        style: { presetIds: ["sparse-cinematic"] },
        styleRevision: 5,
      }),
    );
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const instruction = await screen.findByLabelText(/custom style instruction/i);
    vi.useFakeTimers();
    fireEvent.change(instruction, {
      target: { value: "Keep my local instruction." },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(screen.getByText("Changed elsewhere.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep mine/i })).toBeInTheDocument();
  });

  it("keeps the local style by retrying against the conflict revision", async () => {
    updateMock
      .mockRejectedValueOnce(
        new StyleConflictError("Changed elsewhere.", {
          style: { presetIds: ["sparse-cinematic"] },
          styleRevision: 5,
        }),
      )
      .mockResolvedValueOnce({
        style: {
          presetIds: ["warm-character-driven"],
          customInstruction: "Keep my direction.",
        },
        styleRevision: 6,
      });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const instruction = await screen.findByLabelText(/custom style instruction/i);
    vi.useFakeTimers();
    fireEvent.change(instruction, { target: { value: "Keep my direction." } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenLastCalledWith(
      "book-1",
      {
        presetIds: ["warm-character-driven"],
        customInstruction: "Keep my direction.",
      },
      5,
    );
  });

  it("uses a full-width sheet with a bounded desktop width", async () => {
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("w-full", "sm:max-w-md");
  });

  it("blocks a third preset without replacing either selected preset", async () => {
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    fireEvent.click(await screen.findByRole("button", { name: /sparse & cinematic/i }));
    fireEvent.click(screen.getByRole("button", { name: /mythic & expansive/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/up to two/i);
    expect(screen.getByRole("button", { name: /warm & character-driven/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /sparse & cinematic/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /mythic & expansive/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("retries a failed save without discarding the local selection", async () => {
    updateMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      style: { presetIds: ["warm-character-driven", "sparse-cinematic"] },
      styleRevision: 3,
    });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const sparseButton = await screen.findByRole("button", { name: /sparse & cinematic/i });
    vi.useFakeTimers();
    fireEvent.click(sparseButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Error");
    expect(sparseButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /retry save/i }));
    await act(async () => Promise.resolve());

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("adopts the configured default returned after every choice is cleared", async () => {
    updateMock.mockResolvedValue({
      style: { presetIds: ["warm-character-driven"] },
      styleRevision: 3,
    });
    render(<StyleControl bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));
    const warmButton = await screen.findByRole("button", { name: /warm & character-driven/i });
    vi.useFakeTimers();
    fireEvent.click(warmButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith("book-1", { presetIds: [] }, 2);
    expect(warmButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("ignores a style load that completes after the book changes", async () => {
    let resolveFirst!: (value: typeof loaded) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        ...loaded,
        style: { presetIds: ["sparse-cinematic"] },
        styleRevision: 8,
      });
    const { rerender } = render(<StyleControl bookId="book-1" />);
    rerender(<StyleControl bookId="book-2" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("book-2"));
    await act(async () => resolveFirst(loaded));
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));

    expect(await screen.findByRole("button", { name: /sparse & cinematic/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("rejects an old A response after navigating A to B to A", async () => {
    let resolveOldA!: (value: typeof loaded) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveOldA = resolve)))
      .mockResolvedValueOnce({
        ...loaded,
        style: { presetIds: ["sparse-cinematic"] },
        styleRevision: 5,
      })
      .mockResolvedValueOnce({
        ...loaded,
        style: { presetIds: ["mythic-expansive"] },
        styleRevision: 9,
      });
    const { rerender } = render(<StyleControl bookId="book-a" />);
    rerender(<StyleControl bookId="book-b" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("book-b"));
    rerender(<StyleControl bookId="book-a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await act(async () => resolveOldA(loaded));
    fireEvent.click(screen.getByRole("button", { name: /book style/i }));

    expect(await screen.findByRole("button", { name: /mythic & expansive/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

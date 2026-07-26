import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authenticatedFetchMock, navigateMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

import NewBook from "./books.new";
import { STYLE_PRESETS } from "@/lib/style-presets";

describe("NewBook intake chat", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    navigateMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ bookId: "book-1" }), { status: 200 }),
    );
  });

  it("persists premise answers and the style choice, then navigates away", async () => {
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A survival story on a generation ship" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "Mara, an engineer hiding a mutiny" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "The ship's oxygen debt forces a moral compromise." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sparse & Cinematic/i }));
    fireEvent.click(screen.getByRole("button", { name: /Warm & Character-Driven/i }));
    fireEvent.click(screen.getByRole("button", { name: /create book/i }));

    await waitFor(() =>
      expect(authenticatedFetchMock).toHaveBeenCalledWith(
        "/createBook",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            premiseAnswers: {
              whatToWrite: "A survival story on a generation ship",
              mainCharacter: "Mara, an engineer hiding a mutiny",
              roughPremise: "The ship's oxygen debt forces a moral compromise.",
            },
            style: {
              presetIds: ["sparse-cinematic", "warm-character-driven"],
            },
          }),
        }),
      ),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/books" }));
  });

  it("lets every premise question be skipped without blocking completion", async () => {
    render(<NewBook />);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /create book/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({
      premiseAnswers: {},
      style: {
        presetIds: ["warm-character-driven"],
      },
    });
  });

  it("does not include real author names in preset labels or descriptions", () => {
    const blockedNames = [/hemingway/i, /rowling/i, /king/i, /austen/i, /tolkien/i, /murakami/i];

    for (const preset of STYLE_PRESETS) {
      for (const blockedName of blockedNames) {
        expect(`${preset.label} ${preset.description}`).not.toMatch(blockedName);
      }
    }
  });
});

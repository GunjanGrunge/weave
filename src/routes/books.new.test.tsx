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

function skipAllQuestionsAndCreate() {
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(screen.getByRole("button", { name: /create book/i }));
}

describe("NewBook intake chat", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    navigateMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ bookId: "book-1", openingSuggestion: "ok", openings: [] }),
        { status: 200 },
      ),
    );
  });

  it("persists premise answers and the style choice, then calls createBook", async () => {
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

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = authenticatedFetchMock.mock.calls[0];
    expect(url).toBe("/createBook");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({
      premiseAnswers: {
        whatToWrite: "A survival story on a generation ship",
        mainCharacter: "Mara, an engineer hiding a mutiny",
        roughPremise: "The ship's oxygen debt forces a moral compromise.",
      },
      style: {
        presetIds: ["sparse-cinematic", "warm-character-driven"],
      },
      idempotencyKey: expect.any(String),
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continue to my book/i })).toBeInTheDocument(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("lets every premise question be skipped without blocking completion", async () => {
    render(<NewBook />);

    skipAllQuestionsAndCreate();

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({
      premiseAnswers: {},
      style: {
        presetIds: ["warm-character-driven"],
      },
      idempotencyKey: expect.any(String),
    });
  });

  it("sends a pure custom instruction with no preset, without forcing the default preset", async () => {
    render(<NewBook />);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.change(screen.getByLabelText(/custom style instruction/i), {
      target: { value: "Terse, second-person, present tense." },
    });
    fireEvent.click(screen.getByRole("button", { name: /create book/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({
      premiseAnswers: {},
      style: {
        presetIds: [],
        customInstruction: "Terse, second-person, present tense.",
      },
      idempotencyKey: expect.any(String),
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

  it("renders the Muse's opening suggestions after book creation, before any navigation", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          bookId: "book-1",
          openingSuggestion: "ok",
          openings: [
            { text: "Open mid-heist.", rationale: "Immediate stakes." },
            { text: "Open the morning after.", rationale: "Contrast before the fall." },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    skipAllQuestionsAndCreate();

    await waitFor(() => expect(screen.getByText("Open mid-heist.")).toBeInTheDocument());
    expect(screen.getByText("Immediate stakes.")).toBeInTheDocument();
    expect(screen.getByText("Open the morning after.")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue to my book/i }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$bookId/chat",
      params: { bookId: "book-1" },
    });
  });

  it("shows a non-blocking retry notice when the opening suggestion fails, and Continue still works", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ bookId: "book-1", openingSuggestion: "failed", openings: [] }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    skipAllQuestionsAndCreate();

    await waitFor(() =>
      expect(screen.getByText(/couldn't get opening suggestions/i)).toBeInTheDocument(),
    );

    const continueButton = screen.getByRole("button", { name: /continue to my book/i });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$bookId/chat",
      params: { bookId: "book-1" },
    });
  });

  it("retries the opening suggestion via /retryOpeningSuggestion and shows the result", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ bookId: "book-1", openingSuggestion: "failed", openings: [] }),
        { status: 200 },
      ),
    );
    authenticatedFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          openings: [{ text: "Open on the rooftop.", rationale: "Visual, cinematic start." }],
        }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    skipAllQuestionsAndCreate();

    await waitFor(() =>
      expect(screen.getByText(/couldn't get opening suggestions/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(authenticatedFetchMock).toHaveBeenCalledWith(
        "/retryOpeningSuggestion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ bookId: "book-1" }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Open on the rooftop.")).toBeInTheDocument());
  });
});

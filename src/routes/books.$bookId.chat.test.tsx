import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authenticatedFetchMock, invalidateQueriesMock, navigateMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as object),
    useParams: () => ({ bookId: "book-1" }),
  }),
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/components/book/StyleControl", () => ({
  StyleControl: ({ bookId }: { bookId: string }) => <button>Style for {bookId}</button>,
}));

vi.mock("@/components/book/UsageIndicator", () => ({
  UsageIndicator: ({ bookId }: { bookId: string }) => <span role="status">Usage for {bookId}</span>,
}));

vi.mock("@/components/book/BookTools", () => ({
  BookTools: ({ bookId }: { bookId: string }) => <button>Tools for {bookId}</button>,
}));

import { ChatPage } from "./books.$bookId.chat";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const existingMessages = {
  messages: [
    { type: "system", text: "What do you want to write?", order: 0 },
    { type: "user", text: "A heist novel", order: 1 },
  ],
};

describe("ChatPage", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    invalidateQueriesMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  it("loads and renders existing chat messages on mount", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse(existingMessages));

    render(<ChatPage bookId="book-1" />);

    await waitFor(() => expect(screen.getByText("A heist novel")).toBeInTheDocument());
    expect(screen.getByText("What do you want to write?")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Usage for book-1");
    expect(screen.getByTestId("chat-toolbar")).toHaveClass("flex-wrap");
    expect(screen.getByRole("link", { name: /vision/i })).toBeInTheDocument();
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/getMessages",
      expect.objectContaining({ body: JSON.stringify({ bookId: "book-1" }) }),
    );
  });

  it("blocks submission on an empty description and never calls generateScene", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/describe what happens/i);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the chapter idempotency key when a failed request is retried", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "temporary" }, 500))
      .mockResolvedValueOnce(jsonResponse({ chapterId: "chapter-2", order: 1 }));

    render(<ChatPage bookId="book-1" />);
    const chapterButton = await screen.findByRole("button", { name: /new chapter/i });

    fireEvent.click(chapterButton);
    await screen.findByText(/couldn't start a new chapter/i);
    const firstBody = JSON.parse(authenticatedFetchMock.mock.calls[1][1].body);

    fireEvent.click(chapterButton);
    await screen.findByText(/chapter 2 started/i);
    const secondBody = JSON.parse(authenticatedFetchMock.mock.calls[2][1].body);

    expect(firstBody).toMatchObject({ bookId: "book-1" });
    expect(firstBody.idempotencyKey).toEqual(expect.any(String));
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
  });

  it("blocks submission on a whitespace-only description", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), { target: { value: "   " } });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders a successful generation as an assistant_scene message", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: "session-1",
          text: "The vault door groaned open.",
          provider: "openai",
          model: "gpt-5.6-terra",
        }),
      );

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Mara breaks into the vault." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() =>
      expect(screen.getByText("The vault door groaned open.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Mara breaks into the vault.")).toBeInTheDocument();
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/generateScene",
      expect.objectContaining({
        body: expect.stringContaining(
          '{"bookId":"book-1","mode":"free-text","description":"Mara breaks into the vault."',
        ),
      }),
    );
  });

  it("ignores a second Send click while a generation is already in flight", async () => {
    let resolveGenerate!: (value: Response) => void;
    const pendingGenerate = new Promise<Response>((resolve) => {
      resolveGenerate = resolve;
    });

    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockReturnValueOnce(pendingGenerate);

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Mara breaks into the vault." },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    fireEvent.click(screen.getByLabelText("Send"));
    fireEvent.click(screen.getByLabelText("Send"));

    expect(authenticatedFetchMock).toHaveBeenCalledTimes(2);

    resolveGenerate(
      jsonResponse({
        sessionId: "session-1",
        text: "The vault door groaned open.",
        provider: "openai",
        model: "gpt-5.6-terra",
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("The vault door groaned open.")).toBeInTheDocument(),
    );
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(2);
  });

  it("switches to structured mode, blocks all-empty submission, and never calls generateScene", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));

    expect(screen.getByLabelText("Scene goal")).toBeInTheDocument();
    expect(screen.getByLabelText("Mood")).toBeInTheDocument();
    expect(screen.getByLabelText("POV/character")).toBeInTheDocument();
    expect(screen.getByLabelText("Setting")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/fill in at least one detail/i);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates a scene from a single structured field and renders a summarized user message", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: "session-1",
          text: "The vault door groaned open.",
          provider: "openai",
          model: "gpt-5.6-terra",
        }),
      );

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "tense" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(screen.getByText("The vault door groaned open.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Mood: tense.")).toBeInTheDocument();
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/generateScene",
      expect.objectContaining({
        body: expect.stringContaining(
          '{"bookId":"book-1","mode":"structured","fields":{"sceneGoal":"","mood":"tense","povCharacter":"","setting":""}',
        ),
      }),
    );
  });

  it("keeps all four structured field values on generation failure", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "generation-failed" }, 502));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    fireEvent.change(screen.getByLabelText("Scene goal"), {
      target: { value: "Escape the vault" },
    });
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "tense" } });
    fireEvent.change(screen.getByLabelText("POV/character"), { target: { value: "Mara" } });
    fireEvent.change(screen.getByLabelText("Setting"), {
      target: { value: "Loading dock at 3am" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
    expect(screen.getByLabelText("Scene goal")).toHaveValue("Escape the vault");
    expect(screen.getByLabelText("Mood")).toHaveValue("tense");
    expect(screen.getByLabelText("POV/character")).toHaveValue("Mara");
    expect(screen.getByLabelText("Setting")).toHaveValue("Loading dock at 3am");
  });

  it("blocks structured submission when all fields are whitespace-only", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/fill in at least one detail/i);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves values in both modes when switching back and forth", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Mara breaks into the vault." },
    });
    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "tense" } });
    fireEvent.click(screen.getByRole("button", { name: /describe it/i }));

    expect(screen.getByLabelText(/scene description/i)).toHaveValue("Mara breaks into the vault.");

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    expect(screen.getByLabelText("Mood")).toHaveValue("tense");
  });

  it("clears a stale validation error when switching input mode", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Send"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("switches to polish mode, blocks submission with no aspect selected, and never calls generateScene", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    const polishModeButton = screen.getByRole("button", { name: /polish a draft/i });
    expect(polishModeButton.parentElement).toHaveClass("flex-wrap");
    fireEvent.click(polishModeButton);

    expect(screen.getByLabelText(/draft text/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tighten pacing/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /raise tension: sharpen stakes and urgency/i }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: "Mara walked into the vault." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/select at least one/i);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks polish submission when draft text is empty even if an aspect is selected", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /raise tension/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/paste your draft/i);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates a polished rewrite from a draft and selected aspects", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: "session-1",
          text: "Mara slipped into the vault, pulse hammering.",
          provider: "openai",
          model: "gpt-5.6-terra",
        }),
      );

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    const draftWithOuterWhitespace = " \nMara walked into the vault.\n ";
    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: draftWithOuterWhitespace },
    });
    fireEvent.click(screen.getByRole("button", { name: /raise tension/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(screen.getByText("Mara slipped into the vault, pulse hammering.")).toBeInTheDocument(),
    );
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/generateScene",
      expect.objectContaining({
        body: expect.stringContaining(
          JSON.stringify({
            bookId: "book-1",
            mode: "polish",
            draftText: draftWithOuterWhitespace,
            aspects: ["raise-tension"],
          }).slice(0, -1),
        ),
      }),
    );
  });

  it("keeps the draft text and selected aspects on polish generation failure", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "generation-failed" }, 502));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: "Mara walked into the vault." },
    });
    fireEvent.click(screen.getByRole("button", { name: /raise tension/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
    expect(screen.getByLabelText(/draft text/i)).toHaveValue("Mara walked into the vault.");
    expect(screen.getByRole("button", { name: /raise tension/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /describe it/i }));
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("keeps an oversized draft visible, explains the limit, and blocks generation", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));
    const oversizedDraft = "x".repeat(8_001);

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: oversizedDraft },
    });
    expect(screen.getByLabelText(/draft text/i)).toHaveValue(oversizedDraft);
    expect(screen.getByRole("alert")).toHaveTextContent(/up to 8,000 characters/i);

    fireEvent.click(screen.getByRole("button", { name: /raise tension/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(authenticatedFetchMock).toHaveBeenCalledTimes(1);
  });

  it("resets composer state when navigating to a different book", async () => {
    authenticatedFetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ messages: [] })),
    );

    const { rerender } = render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: "Draft for the first book." },
    });
    fireEvent.click(screen.getByRole("button", { name: /raise tension/i }));

    rerender(<ChatPage bookId="book-2" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toHaveValue(""));
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/getMessages",
      expect.objectContaining({ body: JSON.stringify({ bookId: "book-2" }) }),
    );

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    expect(screen.getByLabelText(/draft text/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /raise tension/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders a Unicode-safe draft preview after successful polish generation", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: "session-1",
          text: "Rewritten.",
          provider: "openai",
          model: "gpt-5.6-terra",
        }),
      );
    const draftAtBoundary = `${"x".repeat(199)}😀tail`;

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.change(screen.getByLabelText(/draft text/i), {
      target: { value: draftAtBoundary },
    });
    fireEvent.click(screen.getByRole("button", { name: /clarify prose/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText((text) => text.includes("😀…"))).toBeInTheDocument();
    expect(screen.queryByText((text) => text.includes("�"))).not.toBeInTheDocument();
  });

  it("clears a stale validation error when switching away from polish mode", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /polish a draft/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /describe it/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error with Retry and keeps the typed description on failure", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "generation-failed" }, 502));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Mara breaks into the vault." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
    expect(screen.getByLabelText(/scene description/i)).toHaveValue("Mara breaks into the vault.");
  });

  it("uses a new idempotency key when the input changes after an ambiguous failure", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "generation-failed" }, 502))
      .mockResolvedValueOnce(
        jsonResponse({
          sessionId: "session-2",
          text: "A different scene.",
          provider: "openai",
          model: "gpt-test",
        }),
      );
    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "First request." },
    });
    fireEvent.click(screen.getByLabelText("Send"));
    await screen.findByRole("button", { name: /retry/i });
    const firstBody = JSON.parse(authenticatedFetchMock.mock.calls[1][1].body);

    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Changed request." },
    });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findByText("A different scene.");
    const secondBody = JSON.parse(authenticatedFetchMock.mock.calls[2][1].body);

    expect(secondBody.idempotencyKey).not.toBe(firstBody.idempotencyKey);
  });

  it("ignores an old generation response after navigating A to B to A", async () => {
    let resolveOldGeneration!: (value: Response) => void;
    authenticatedFetchMock.mockImplementation((url: string) => {
      if (url === "/getMessages") {
        return Promise.resolve(jsonResponse({ messages: [] }));
      }
      return new Promise<Response>((resolve) => {
        resolveOldGeneration = resolve;
      });
    });
    const { rerender } = render(<ChatPage bookId="book-a" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Old request." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    rerender(<ChatPage bookId="book-b" />);
    await waitFor(() =>
      expect(authenticatedFetchMock).toHaveBeenCalledWith(
        "/getMessages",
        expect.objectContaining({ body: JSON.stringify({ bookId: "book-b" }) }),
      ),
    );
    rerender(<ChatPage bookId="book-a" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    resolveOldGeneration(
      jsonResponse({
        sessionId: "old-session",
        text: "Stale generated prose.",
        provider: "openai",
        model: "gpt-test",
      }),
    );
    await Promise.resolve();

    expect(screen.queryByText("Stale generated prose.")).not.toBeInTheDocument();
  });
});

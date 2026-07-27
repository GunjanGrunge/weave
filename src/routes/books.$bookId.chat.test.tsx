import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authenticatedFetchMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
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
}));

vi.mock("@/lib/api", () => ({
  authenticatedFetch: authenticatedFetchMock,
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
  });

  it("loads and renders existing chat messages on mount", async () => {
    authenticatedFetchMock.mockResolvedValue(jsonResponse(existingMessages));

    render(<ChatPage bookId="book-1" />);

    await waitFor(() => expect(screen.getByText("A heist novel")).toBeInTheDocument());
    expect(screen.getByText("What do you want to write?")).toBeInTheDocument();
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
        body: JSON.stringify({
          bookId: "book-1",
          mode: "free-text",
          description: "Mara breaks into the vault.",
        }),
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
        body: JSON.stringify({
          bookId: "book-1",
          mode: "structured",
          fields: { sceneGoal: "", mood: "tense", povCharacter: "", setting: "" },
        }),
      }),
    );
  });

  it("keeps structured field values on generation failure", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "generation-failed" }, 502));

    render(<ChatPage bookId="book-1" />);
    await waitFor(() => expect(screen.getByLabelText(/scene description/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quick details/i }));
    fireEvent.change(screen.getByLabelText("Mood"), { target: { value: "tense" } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Mood")).toHaveValue("tense");
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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/scene description/i)).toHaveValue("Mara breaks into the vault.");
  });
});

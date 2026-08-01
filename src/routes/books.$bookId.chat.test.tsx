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
vi.mock("@/lib/api", () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));
vi.mock("@/components/book/StyleControl", () => ({ StyleControl: () => <button>Style</button> }));
vi.mock("@/components/book/UsageIndicator", () => ({
  UsageIndicator: () => <span role="status">Usage</span>,
}));
vi.mock("@/components/book/BookTools", () => ({ BookTools: () => <button>Tools</button> }));

import { ChatPage } from "./books.$bookId.chat";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("ChatPage", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    invalidateQueriesMock.mockReset().mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  it("defaults to an editorial conversation rather than drafting prose", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(
        response({ messages: [{ type: "system", text: "New room", order: 0 }] }),
      )
      .mockResolvedValueOnce(
        response({
          mode: "clarify",
          text: "That gives us a strong pressure point. What does Eric stand to lose?",
          provider: "openai",
          model: "gpt-test",
        }),
      );
    render(<ChatPage bookId="book-1" />);
    await screen.findByText("New room");

    expect(screen.getByRole("button", { name: "Talk with Muse" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Eric should feel guilty before the crime." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await screen.findByText(/strong pressure point/i);
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/consultMuse",
      expect.objectContaining({
        body: expect.stringContaining(
          '"bookId":"book-1","message":"Eric should feel guilty before the crime."',
        ),
      }),
    );
    expect(authenticatedFetchMock.mock.calls.some(([path]) => path === "/generateScene")).toBe(
      false,
    );
  });

  it("only generates a stitch after the writer explicitly selects Draft next stitch", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(response({ messages: [] })).mockResolvedValueOnce(
      response({
        sessionId: "session-1",
        messageId: "message-1",
        text: "Drafted scene.",
        revision: 0,
        status: "active",
        provider: "openai",
        model: "gpt-test",
        actionable: true,
      }),
    );
    render(<ChatPage bookId="book-1" />);
    await screen.findByRole("button", { name: "Draft next stitch" });
    fireEvent.click(screen.getByRole("button", { name: "Draft next stitch" }));
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Eric finds a clue in the car." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    await screen.findByText("Drafted scene.");
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/generateScene",
      expect.objectContaining({ body: expect.stringContaining('"mode":"free-text"') }),
    );
  });

  it("keeps the writer's thought when the Muse cannot respond", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(response({ code: "muse-unavailable" }, 502));
    render(<ChatPage bookId="book-1" />);
    await screen.findByLabelText(/scene description/i);
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "Keep the setting fictional." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByText(/could not respond/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scene description/i)).toHaveValue("Keep the setting fictional.");
  });

  it("renders an actionable scene draft directly from a conversational turn when Muse classifies readiness as draft", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(response({ messages: [] })).mockResolvedValueOnce(
      response({
        mode: "draft",
        sessionId: "session-1",
        messageId: "message-1",
        text: "The party was already loud when Eric arrived.",
        provider: "openai",
        model: "gpt-test",
        revision: 0,
        status: "active",
        actionable: true,
      }),
    );
    render(<ChatPage bookId="book-1" />);
    await screen.findByLabelText(/scene description/i);
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "A young guy celebrating his farewell, settled in." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByText(/party was already loud/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("shows a non-actionable draft as plain prose when the pipeline could not persist a review session", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(response({ messages: [] })).mockResolvedValueOnce(
      response({
        mode: "draft",
        sessionId: "",
        messageId: "",
        text: "The party was already loud when Eric arrived.",
        provider: "openai",
        model: "gpt-test",
        revision: 0,
        actionable: false,
      }),
    );
    render(<ChatPage bookId="book-1" />);
    await screen.findByLabelText(/scene description/i);
    fireEvent.change(screen.getByLabelText(/scene description/i), {
      target: { value: "A young guy celebrating his farewell, settled in." },
    });
    fireEvent.click(screen.getByLabelText("Send"));

    expect(await screen.findByText(/party was already loud/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });
});

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
        response({ text: "That gives us a strong pressure point. What does Eric stand to lose?" }),
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
        body: JSON.stringify({
          bookId: "book-1",
          message: "Eric should feel guilty before the crime.",
        }),
      }),
    );
    expect(authenticatedFetchMock.mock.calls.some(([path]) => path === "/generateScene")).toBe(
      false,
    );
  });

  it("only generates a scene after the writer explicitly selects Draft a scene", async () => {
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
    await screen.findByRole("button", { name: "Draft a scene" });
    fireEvent.click(screen.getByRole("button", { name: "Draft a scene" }));
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
});

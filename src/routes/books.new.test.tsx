import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authenticatedFetchMock, fetchStyleConfigMock, navigateMock, invalidateQueriesMock } =
  vi.hoisted(() => ({
    authenticatedFetchMock: vi.fn(),
    fetchStyleConfigMock: vi.fn(),
    navigateMock: vi.fn(),
    invalidateQueriesMock: vi.fn(),
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
vi.mock("@/lib/api", () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock("@/lib/styles", () => ({ fetchStyleConfig: fetchStyleConfigMock }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

import NewBook from "./books.new";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("NewBook", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    fetchStyleConfigMock
      .mockReset()
      .mockResolvedValue({ defaultPresetId: "warm-character-driven" });
    navigateMock.mockReset();
    invalidateQueriesMock.mockReset().mockResolvedValue(undefined);
  });

  it("starts from an open thought instead of a fixed intake questionnaire", () => {
    render(<NewBook />);
    expect(screen.getByRole("heading", { name: /start with a conversation/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/opening thought/i)).toBeInTheDocument();
    expect(screen.queryByText("Who is the main character?")).not.toBeInTheDocument();
  });

  it("opens a draft workspace and persists the first Muse exchange", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(response({ bookId: "book-1" }))
      .mockResolvedValueOnce(
        response({ text: "A strong opening tension. What does Eric fear losing?" }),
      );
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/opening thought/i), {
      target: { value: "A crime thriller about Eric and a borrowed car." },
    });
    fireEvent.click(screen.getByRole("button", { name: /talk with the muse/i }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/books/$bookId/chat",
        params: { bookId: "book-1" },
      }),
    );
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toMatchObject({
      premiseAnswers: { whatToWrite: "A crime thriller about Eric and a borrowed car." },
      style: { presetIds: ["warm-character-driven"] },
    });
    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/consultMuse",
      expect.objectContaining({
        body: JSON.stringify({
          bookId: "book-1",
          message: "A crime thriller about Eric and a borrowed car.",
        }),
      }),
    );
  });

  it("keeps the writer's thought visible when a room cannot be opened", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(response({ code: "internal" }, 500));
    render(<NewBook />);
    fireEvent.change(screen.getByLabelText(/opening thought/i), {
      target: { value: "A lighthouse mystery" },
    });
    fireEvent.click(screen.getByRole("button", { name: /talk with the muse/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not open/i);
    expect(screen.getByLabelText(/opening thought/i)).toHaveValue("A lighthouse mystery");
  });
});

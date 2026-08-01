import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { authenticatedFetchMock, invalidateQueriesMock, useManuscriptMock } = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  useManuscriptMock: vi.fn(),
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
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/api", () => ({ authenticatedFetch: authenticatedFetchMock }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));
vi.mock("@/lib/manuscript", () => ({
  useManuscript: useManuscriptMock,
  manuscriptQueryKey: (bookId: string) => ["manuscript", bookId],
  enhanceManuscriptChapter: vi.fn(),
}));
vi.mock("@/components/book/StyleControl", () => ({ StyleControl: () => <button>Style</button> }));
vi.mock("@/components/book/UsageIndicator", () => ({
  UsageIndicator: () => <span role="status">Usage</span>,
}));
vi.mock("@/components/book/BookTools", () => ({ BookTools: () => <button>Tools</button> }));

import { WriteWorkspace } from "./WriteWorkspace";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("WriteWorkspace", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset().mockResolvedValue(response({ messages: [] }));
    invalidateQueriesMock.mockReset();
    useManuscriptMock.mockReset().mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        bookId: "book-1",
        title: "The Long Road",
        chapters: [],
        sceneCount: 0,
        wordCount: 0,
      },
      refetch: vi.fn(),
    });
  });

  it("shows Chat with the manuscript overlay closed by default, and opens it via the toggle", async () => {
    render(<WriteWorkspace bookId="book-1" />);

    await screen.findByText("Book Chat");
    expect(screen.queryByRole("heading", { name: "The Long Road" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /manuscript/i }));

    expect(await screen.findByRole("heading", { name: "The Long Road" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close manuscript/i })).toBeInTheDocument();
  });

  it("opens with the manuscript overlay visible when initialManuscriptOpen is set", async () => {
    render(<WriteWorkspace bookId="book-1" initialManuscriptOpen />);

    expect(await screen.findByRole("heading", { name: "The Long Road" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close manuscript/i }));

    expect(screen.queryByRole("heading", { name: "The Long Road" })).not.toBeInTheDocument();
  });
});

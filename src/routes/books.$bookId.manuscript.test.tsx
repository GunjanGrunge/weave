import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useManuscriptMock, refetchMock } = vi.hoisted(() => ({
  useManuscriptMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as object),
    useParams: () => ({ bookId: "book-1" }),
  }),
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    params?: { bookId?: string };
  }) => (
    <a href={params?.bookId ? to.replace("$bookId", params.bookId) : to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/book/BookTools", () => ({
  BookTools: () => <button type="button">Versions</button>,
}));

vi.mock("@/lib/manuscript", () => ({
  manuscriptQueryKey: (bookId: string) => ["manuscript", bookId],
  useManuscript: useManuscriptMock,
}));

import { ManuscriptPage } from "./books.$bookId.manuscript";

const loadedManuscript = {
  bookId: "book-1",
  title: "The Long Road",
  chapters: [
    {
      chapterId: "chapter-1",
      order: 0,
      title: "Chapter 1",
      scenes: [
        { sceneId: "scene-1", order: 0, text: "The road began under a quiet moon." },
        { sceneId: "scene-2", order: 1, text: "Mara kept walking." },
      ],
    },
    {
      chapterId: "chapter-2",
      order: 1,
      title: "Chapter 2",
      scenes: [],
    },
  ],
  sceneCount: 2,
  wordCount: 11,
};

describe("ManuscriptPage", () => {
  beforeEach(() => {
    refetchMock.mockReset();
    useManuscriptMock.mockReset();
    vi.stubGlobal("print", vi.fn());
  });

  it("renders accepted prose in chapter order with navigation and book actions", () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: loadedManuscript,
      refetch: refetchMock,
    });

    render(<ManuscriptPage bookId="book-1" />);

    expect(screen.getByRole("heading", { name: "The Long Road" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chapter 1" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Chapter 2" })).not.toBeInTheDocument();
    expect(screen.getByText("The road began under a quiet moon.")).toBeInTheDocument();
    expect(screen.getByText(/11 words/i)).toBeInTheDocument();
    expect(screen.queryByText(/manuscript preview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2 scenes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat", exact: true })).toHaveAttribute(
      "href",
      "/books/book-1/chat",
    );
    expect(screen.getByRole("button", { name: "Versions" })).toBeInTheDocument();
  });

  it("prints the typeset manuscript", () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: loadedManuscript,
      refetch: refetchMock,
    });

    render(<ManuscriptPage bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /print/i }));

    expect(window.print).toHaveBeenCalledOnce();
  });

  it("explains that only accepted scenes appear in an empty manuscript", () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        ...loadedManuscript,
        chapters: [{ ...loadedManuscript.chapters[0], scenes: [] }],
        sceneCount: 0,
        wordCount: 0,
      },
      refetch: refetchMock,
    });

    render(<ManuscriptPage bookId="book-1" />);

    expect(screen.getByText("No accepted prose yet")).toBeInTheDocument();
    expect(screen.getByText(/generated candidates stay in chat/i)).toBeInTheDocument();
  });

  it("offers retry when loading fails", () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("Could not load this manuscript."),
      data: undefined,
      refetch: refetchMock,
    });

    render(<ManuscriptPage bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetchMock).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { useManuscriptMock, refetchMock, enhanceChapterMock, invalidateQueriesMock } = vi.hoisted(
  () => ({
    useManuscriptMock: vi.fn(),
    refetchMock: vi.fn(),
    enhanceChapterMock: vi.fn(),
    invalidateQueriesMock: vi.fn(),
  }),
);

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
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
  enhanceManuscriptChapter: enhanceChapterMock,
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
    enhanceChapterMock.mockReset();
    invalidateQueriesMock.mockReset();
    invalidateQueriesMock.mockResolvedValue(undefined);
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

  it("edits a chapter and submits the draft for enhancement", async () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: loadedManuscript,
      refetch: refetchMock,
    });
    enhanceChapterMock.mockResolvedValue({
      chapterId: "chapter-1",
      title: "The Beginning of the King",
      scenes: [{ sceneId: "scene-1", text: "The road began beneath a quiet moon." }],
    });

    render(<ManuscriptPage bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
    fireEvent.change(screen.getByLabelText("Chapter title"), {
      target: { value: "The Begining of the King" },
    });
    fireEvent.change(screen.getByLabelText("Chapter 1 text 1"), {
      target: { value: "The road began beneath a quiet moon." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enhance & save" }));

    await waitFor(() =>
      expect(enhanceChapterMock).toHaveBeenCalledWith("book-1", {
        chapterId: "chapter-1",
        originalTitle: "Chapter 1",
        draftTitle: "The Begining of the King",
        scenes: [
          {
            sceneId: "scene-1",
            originalText: "The road began under a quiet moon.",
            draftText: "The road began beneath a quiet moon.",
          },
        ],
      }),
    );
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["manuscript", "book-1"],
    });
  });

  it("keeps an unsaved draft visible when enhancement fails", async () => {
    useManuscriptMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: loadedManuscript,
      refetch: refetchMock,
    });
    enhanceChapterMock.mockRejectedValue(new Error("WEAVE could not enhance this chapter."));

    render(<ManuscriptPage bookId="book-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
    fireEvent.change(screen.getByLabelText("Chapter 1 text 1"), {
      target: { value: "My unsaved revision." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enhance & save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "WEAVE could not enhance this chapter.",
    );
    expect(screen.getByDisplayValue("My unsaved revision.")).toBeInTheDocument();
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

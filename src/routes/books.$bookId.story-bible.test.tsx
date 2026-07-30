import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { StoryBiblePage } from "./books.$bookId.story-bible";

const response = {
  book: { bookId: "book-1", title: "A mystery" },
  memoryState: "stale",
  characters: [
    {
      id: "mr-bell",
      name: "Mr. Bell",
      aliases: ["Bell"],
      summary: "An elderly witness.",
      stableTraits: { age: "72" },
      currentState: { occupation: "retired teacher" },
      timeline: [
        {
          id: "event-1",
          label: "Enlisted",
          description: "Bell enlisted at nineteen.",
          chronology: "historical",
          source: { chapterId: "chapter-1", sceneId: "scene-1", excerpt: "At nineteen..." },
        },
      ],
      sources: [
        {
          chapterId: "chapter-1",
          sceneId: "scene-1",
          excerpt: "Mr. Bell was seventy-two.",
        },
      ],
      conflicts: [
        {
          field: "stableTraits.age",
          canonicalValue: "72",
          evidenceValue: "35",
          source: { chapterId: "chapter-2", sceneId: "scene-2", excerpt: "Bell was 35." },
        },
      ],
      authorOverrides: { stableTraits: { age: "72" }, currentState: {} },
      lockedFields: ["stableTraits.age"],
      verification: "verified",
      migrationState: "native",
      archived: false,
      version: 2,
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("StoryBiblePage", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset().mockResolvedValue(jsonResponse(response));
  });

  it("renders loading, stale memory, character state, provenance, timeline, and conflicts", async () => {
    render(<StoryBiblePage bookId="book-1" />);

    expect(screen.getByText(/loading story bible/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Mr. Bell" })).toBeInTheDocument();
    expect(screen.getByText(/memory needs attention/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("72")).toBeInTheDocument();
    expect(screen.getByText("retired teacher")).toBeInTheDocument();
    expect(screen.getByText("Enlisted")).toBeInTheDocument();
    expect(screen.getByText(/chapter-1.*scene-1/i)).toBeInTheDocument();
    expect(screen.getByText(/conflicting evidence/i)).toBeInTheDocument();
  });

  it("saves edited values and field locks with optimistic versioning", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(response)).mockResolvedValueOnce(
      jsonResponse({
        character: {
          ...response.characters[0],
          summary: "The book's elderly witness.",
          version: 3,
        },
      }),
    );

    render(<StoryBiblePage bookId="book-1" />);

    fireEvent.change(await screen.findByLabelText(/character summary/i), {
      target: { value: "The book's elderly witness." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save character/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    expect(authenticatedFetchMock.mock.calls[1][0]).toBe("/updateStoryBibleCharacter");
    expect(JSON.parse(authenticatedFetchMock.mock.calls[1][1].body)).toMatchObject({
      bookId: "book-1",
      characterId: "mr-bell",
      expectedVersion: 2,
      character: {
        summary: "The book's elderly witness.",
        lockedFields: ["stableTraits.age"],
      },
    });
  });

  it("rebuilds stale memory even when canonical characters already exist", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse({ status: "started", sceneCount: 4 }, 202));

    render(<StoryBiblePage bookId="book-1" />);

    expect(await screen.findByRole("heading", { name: "Mr. Bell" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /rebuild from manuscript/i }));

    expect(await screen.findByText(/rebuild started for 4 scenes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rebuild started/i })).toBeDisabled();
    expect(authenticatedFetchMock.mock.calls[1][0]).toBe("/rebuildStoryBible");
  });

  it("ignores a previous book response that resolves after navigation", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    authenticatedFetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { rerender } = render(<StoryBiblePage bookId="book-1" />);
    rerender(<StoryBiblePage bookId="book-2" />);
    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));

    const secondResponse = {
      ...response,
      book: { bookId: "book-2", title: "Second book" },
      characters: [{ ...response.characters[0], id: "new-character", name: "New Character" }],
    };
    await act(async () => {
      resolveSecond(jsonResponse(secondResponse));
    });
    expect(await screen.findByRole("heading", { name: "New Character" })).toBeInTheDocument();

    await act(async () => {
      resolveFirst(jsonResponse(response));
    });
    expect(screen.queryByRole("heading", { name: "Mr. Bell" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Second book" })).toBeInTheDocument();
  });

  it("moves a lock when its editable field is renamed", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(response)).mockResolvedValueOnce(
      jsonResponse({
        character: {
          ...response.characters[0],
          stableTraits: { yearsOld: "72" },
          lockedFields: ["stableTraits.yearsOld"],
          version: 3,
        },
      }),
    );

    render(<StoryBiblePage bookId="book-1" />);

    fireEvent.change(await screen.findByLabelText("Stable traits field 1"), {
      target: { value: "yearsOld" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save character/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[1][1].body)).toMatchObject({
      character: {
        stableTraits: { yearsOld: "72" },
        lockedFields: ["stableTraits.yearsOld"],
      },
    });
  });

  it("allows long unbroken character names to wrap within mobile layouts", async () => {
    const longName = "A".repeat(160);
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...response,
        characters: [{ ...response.characters[0], name: longName }],
      }),
    );

    render(<StoryBiblePage bookId="book-1" />);

    const heading = await screen.findByRole("heading", { name: longName });
    expect(heading).toHaveClass("min-w-0", "break-words", "[overflow-wrap:anywhere]");
    const selectorName = screen
      .getByRole("button", { name: new RegExp(longName) })
      .querySelector("span");
    expect(selectorName).toHaveClass("min-w-0", "break-words", "[overflow-wrap:anywhere]");
  });

  it("shows empty and ownership error states", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ ...response, memoryState: "empty", characters: [] }))
      .mockResolvedValueOnce(jsonResponse({ status: "started", sceneCount: 2 }, 202));
    const { unmount } = render(<StoryBiblePage bookId="book-1" />);
    expect(await screen.findByText(/no characters recorded yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /build from manuscript/i }));
    expect(await screen.findByText(/building memory from 2 existing scenes/i)).toBeInTheDocument();
    expect(authenticatedFetchMock.mock.calls[1][0]).toBe("/rebuildStoryBible");
    unmount();

    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ code: "unauthenticated" }, 401));
    render(<StoryBiblePage bookId="book-1" />);
    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
  });
});

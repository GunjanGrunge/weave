import { readFileSync } from "node:fs";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

import { VisionPage } from "./books.$bookId.vision";

const loadedVision = {
  book: { bookId: "book-1", title: "A heist", style: { presetIds: ["warm"] } },
  vision: {
    theme: "Heist / literary",
    premise: "One last job goes sideways.",
    characterIntents: ["Mara wants out"],
    structureMap: [{ beat: "Opening Image", sceneRef: "scene-1" }],
    guidanceDial: "normal",
    threads: [
      {
        id: "thread-1",
        surface: "A cracked watch",
        meaning: "Mara is running out of time",
        subtlety: "subtle",
        payoffIntent: "Reveal at midpoint",
        status: "open",
        appearances: [],
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("VisionPage", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(jsonResponse(loadedVision));
  });

  it("loads and renders editable Vision fields plus read-only structure/guidance state", async () => {
    render(<VisionPage bookId="book-1" />);

    await waitFor(() => expect(screen.getByDisplayValue("Heist / literary")).toBeInTheDocument());

    expect(screen.getByDisplayValue("One last job goes sideways.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mara wants out")).toBeInTheDocument();
    expect(screen.getByText("Opening Image")).toBeInTheDocument();
    expect(screen.getByText("scene-1")).toBeInTheDocument();
    expect(screen.getByText("Guidance Dial")).toBeInTheDocument();
    expect(screen.getByText("normal")).toBeInTheDocument();

    const structureMap = screen.getByLabelText("Structure Map read-only");
    expect(within(structureMap).queryByRole("button")).not.toBeInTheDocument();
  });

  it("saves theme, premise, and character intents through /updateVision", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(loadedVision)).mockResolvedValueOnce(
      jsonResponse({
        vision: {
          ...loadedVision.vision,
          theme: "Mystery",
          premise: "A cleaner heist premise.",
          characterIntents: ["Mara wants out", "Ivo wants revenge"],
        },
      }),
    );

    render(<VisionPage bookId="book-1" />);

    fireEvent.change(await screen.findByLabelText(/theme \/ genre/i), {
      target: { value: "Mystery" },
    });
    fireEvent.change(screen.getByLabelText(/premise/i), {
      target: { value: "A cleaner heist premise." },
    });
    fireEvent.change(screen.getByLabelText(/character intents/i), {
      target: { value: "Mara wants out\nIvo wants revenge" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save vision/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    expect(authenticatedFetchMock.mock.calls[1][0]).toBe("/updateVision");
    const payload = JSON.parse(authenticatedFetchMock.mock.calls[1][1].body as string);
    expect(payload).toMatchObject({
      bookId: "book-1",
      vision: {
        theme: "Mystery",
        premise: "A cleaner heist premise.",
        characterIntents: ["Mara wants out", "Ivo wants revenge"],
      },
    });
  });

  it("adds, edits, and marks a narrative thread paid off", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(
        jsonResponse({ ...loadedVision, vision: { ...loadedVision.vision, threads: [] } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          vision: {
            ...loadedVision.vision,
            threads: [
              {
                id: "thread-new",
                surface: "The locked drawer",
                meaning: "A hidden inheritance",
                subtlety: "invisible",
                payoffIntent: "Pay off in chapter five",
                status: "paid_off",
                appearances: [],
              },
            ],
          },
        }),
      );

    render(<VisionPage bookId="book-1" />);

    fireEvent.click(await screen.findByRole("button", { name: /add thread/i }));
    fireEvent.change(screen.getByLabelText(/thread 1 surface detail/i), {
      target: { value: "The locked drawer" },
    });
    fireEvent.change(screen.getByLabelText(/thread 1 hidden meaning/i), {
      target: { value: "A hidden inheritance" },
    });
    fireEvent.change(screen.getByLabelText(/thread 1 subtlety/i), {
      target: { value: "invisible" },
    });
    fireEvent.change(screen.getByLabelText(/thread 1 payoff intent/i), {
      target: { value: "Pay off in chapter five" },
    });
    fireEvent.click(screen.getByRole("button", { name: /mark paid off/i }));
    fireEvent.click(screen.getByRole("button", { name: /save vision/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(authenticatedFetchMock.mock.calls[1][1].body as string);
    expect(payload.vision.threads).toEqual([
      {
        surface: "The locked drawer",
        meaning: "A hidden inheritance",
        subtlety: "invisible",
        payoffIntent: "Pay off in chapter five",
        status: "paid_off",
        appearances: [],
      },
    ]);
  });

  it("removes a narrative thread", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(loadedVision));

    render(<VisionPage bookId="book-1" />);

    await screen.findByLabelText(/thread 1 surface detail/i);
    fireEvent.click(screen.getByRole("button", { name: /remove thread 1/i }));

    expect(screen.queryByLabelText(/thread 1 surface detail/i)).not.toBeInTheDocument();
    expect(screen.getByText("No narrative threads yet.")).toBeInTheDocument();
  });

  it("automatically saves narrative thread changes after a short delay", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(loadedVision)).mockResolvedValueOnce(
      jsonResponse({
        vision: {
          ...loadedVision.vision,
          threads: [{ ...loadedVision.vision.threads[0], surface: "A stopped watch" }],
        },
      }),
    );

    render(<VisionPage bookId="book-1" />);

    fireEvent.change(await screen.findByLabelText(/thread 1 surface detail/i), {
      target: { value: "A stopped watch" },
    });

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(2), {
      timeout: 1_500,
    });
    expect(JSON.parse(authenticatedFetchMock.mock.calls[1][1].body as string)).toMatchObject({
      vision: {
        threads: [expect.objectContaining({ surface: "A stopped watch" })],
      },
    });
  });

  it("shows a distinct message when the caller doesn't own the book (401)", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ code: "unauthenticated" }, 401));

    render(<VisionPage bookId="book-1" />);

    await waitFor(() =>
      expect(screen.getByText("You don't have access to this book.")).toBeInTheDocument(),
    );
  });

  it("shows a distinct message when the book or vision is not found (404)", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ code: "not-found" }, 404));

    render(<VisionPage bookId="book-1" />);

    await waitFor(() =>
      expect(screen.getByText("This book's Vision could not be found.")).toBeInTheDocument(),
    );
  });

  it("does not import or use the client Firestore SDK", () => {
    const source = readFileSync("src/routes/books.$bookId.vision.tsx", "utf8");

    expect(source).not.toContain("firebase/firestore");
    expect(source).not.toContain("getFirestore");
  });
});

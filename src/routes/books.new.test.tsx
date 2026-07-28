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

vi.mock("@/lib/api", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { uid: "user-a" }, loading: false }),
}));

vi.mock("@/lib/styles", async () => {
  const actual = await vi.importActual<typeof import("@/lib/styles")>("@/lib/styles");
  return { ...actual, fetchStyleConfig: fetchStyleConfigMock };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

import NewBook from "./books.new";

const STYLE_PRESETS = [
  {
    id: "sparse-cinematic",
    label: "Sparse & Cinematic",
    description: "Lean scenes, crisp images, and visible action.",
    active: true,
  },
  {
    id: "warm-character-driven",
    label: "Warm & Character-Driven",
    description: "Human, intimate scenes led by relationships.",
    active: true,
  },
  {
    id: "mythic-expansive",
    label: "Mythic & Expansive",
    description: "A broad register with spacious pacing.",
    active: true,
  },
];

async function skipAllQuestionsAndCreate() {
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(screen.getByRole("button", { name: /skip/i }));
  fireEvent.click(await screen.findByRole("button", { name: /create book/i }));
}

describe("NewBook intake chat", () => {
  beforeEach(() => {
    localStorage.clear();
    authenticatedFetchMock.mockReset();
    fetchStyleConfigMock.mockReset().mockResolvedValue({
      presets: STYLE_PRESETS,
      defaultPresetId: "warm-character-driven",
    });
    navigateMock.mockReset();
    invalidateQueriesMock.mockReset();
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ bookId: "book-1", openingSuggestion: "ok", openings: [] }), {
        status: 200,
      }),
    );
  });

  it("persists premise answers and the style choice, then calls createBook", async () => {
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A survival story on a generation ship" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "Mara, an engineer hiding a mutiny" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "The ship's oxygen debt forces a moral compromise." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Sparse & Cinematic/i }));
    fireEvent.click(screen.getByRole("button", { name: /Warm & Character-Driven/i }));
    fireEvent.click(screen.getByRole("button", { name: /create book/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = authenticatedFetchMock.mock.calls[0];
    expect(url).toBe("/createBook");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({
      premiseAnswers: {
        whatToWrite: "A survival story on a generation ship",
        mainCharacter: "Mara, an engineer hiding a mutiny",
        roughPremise: "The ship's oxygen debt forces a moral compromise.",
      },
      style: {
        presetIds: ["sparse-cinematic", "warm-character-driven"],
      },
      idempotencyKey: expect.any(String),
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continue to my book/i })).toBeInTheDocument(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("lets every premise question be skipped without blocking completion", async () => {
    render(<NewBook />);

    await skipAllQuestionsAndCreate();

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({
      premiseAnswers: {},
      style: {
        presetIds: ["warm-character-driven"],
      },
      idempotencyKey: expect.any(String),
    });
  });

  it("sends a pure custom instruction with no preset, without forcing the default preset", async () => {
    render(<NewBook />);

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.change(screen.getByLabelText(/custom style instruction/i), {
      target: { value: "Terse, second-person, present tense." },
    });
    fireEvent.click(await screen.findByRole("button", { name: /create book/i }));

    await waitFor(() => expect(authenticatedFetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authenticatedFetchMock.mock.calls[0][1].body)).toEqual({
      premiseAnswers: {},
      style: {
        presetIds: [],
        customInstruction: "Terse, second-person, present tense.",
      },
      idempotencyKey: expect.any(String),
    });
  });

  it("does not include real author names in preset labels or descriptions", () => {
    const blockedNames = [/hemingway/i, /rowling/i, /king/i, /austen/i, /tolkien/i, /murakami/i];

    for (const preset of STYLE_PRESETS) {
      for (const blockedName of blockedNames) {
        expect(`${preset.label} ${preset.description}`).not.toMatch(blockedName);
      }
    }
  });

  it("keeps the draft and retries when catalog loading fails", async () => {
    fetchStyleConfigMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      presets: STYLE_PRESETS,
      defaultPresetId: "warm-character-driven",
    });
    render(<NewBook />);
    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A city that forgets its residents" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(await screen.findByText(/could not load style options/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("button", { name: /sparse & cinematic/i })).toBeInTheDocument();
    expect(screen.getByText("A city that forgets its residents")).toBeInTheDocument();
  });

  it("blocks a third intake preset and bounds custom guidance", async () => {
    render(<NewBook />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    fireEvent.click(await screen.findByRole("button", { name: /sparse & cinematic/i }));
    fireEvent.click(screen.getByRole("button", { name: /warm & character-driven/i }));
    fireEvent.click(screen.getByRole("button", { name: /mythic & expansive/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/up to two/i);
    expect(screen.getByRole("button", { name: /sparse & cinematic/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText(/custom style instruction/i)).toHaveAttribute("maxlength", "1000");
  });

  it("renders the Muse's opening suggestions after book creation, before any navigation", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          bookId: "book-1",
          openingSuggestion: "ok",
          openings: [
            { text: "Open mid-heist.", rationale: "Immediate stakes." },
            { text: "Open the morning after.", rationale: "Contrast before the fall." },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    await skipAllQuestionsAndCreate();

    await waitFor(() => expect(screen.getByText("Open mid-heist.")).toBeInTheDocument());
    expect(screen.getByText("Immediate stakes.")).toBeInTheDocument();
    expect(screen.getByText("Open the morning after.")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /continue to my book/i }));
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$bookId/chat",
      params: { bookId: "book-1" },
    });
  });

  it("shows a non-blocking retry notice when the opening suggestion fails, and Continue still works", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ bookId: "book-1", openingSuggestion: "failed", openings: [] }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    await skipAllQuestionsAndCreate();

    await waitFor(() =>
      expect(screen.getByText(/couldn't get opening suggestions/i)).toBeInTheDocument(),
    );

    const continueButton = screen.getByRole("button", { name: /continue to my book/i });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/books/$bookId/chat",
      params: { bookId: "book-1" },
    });
  });

  it("retries the opening suggestion via /retryOpeningSuggestion and shows the result", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ bookId: "book-1", openingSuggestion: "failed", openings: [] }),
        { status: 200 },
      ),
    );
    authenticatedFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "ok",
          openings: [{ text: "Open on the rooftop.", rationale: "Visual, cinematic start." }],
        }),
        { status: 200 },
      ),
    );

    render(<NewBook />);
    await skipAllQuestionsAndCreate();

    await waitFor(() =>
      expect(screen.getByText(/couldn't get opening suggestions/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() =>
      expect(authenticatedFetchMock).toHaveBeenCalledWith(
        "/retryOpeningSuggestion",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ bookId: "book-1" }),
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Open on the rooftop.")).toBeInTheDocument());
  });

  it("restores an interrupted intake for the signed-in writer", async () => {
    const firstRender = render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A mystery inside a lighthouse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText(/saved on this device/i)).toBeInTheDocument());
    firstRender.unmount();

    render(<NewBook />);

    expect(screen.getByText("A mystery inside a lighthouse")).toBeInTheDocument();
    expect(screen.getByText("Who is the main character?")).toBeInTheDocument();
  });

  it("discards a saved intake and returns to the first question", async () => {
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A mystery inside a lighthouse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(localStorage.getItem("story:intake:user-a")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /discard intake/i }));

    expect(screen.queryByText("A mystery inside a lighthouse")).not.toBeInTheDocument();
    expect(screen.getByText("What do you want to write?")).toBeInTheDocument();
    expect(localStorage.getItem("story:intake:user-a")).toBeNull();
  });

  it("ignores a malformed saved intake instead of crashing the route", () => {
    localStorage.setItem(
      "story:intake:user-a",
      JSON.stringify({
        version: 1,
        questionIndex: 0,
        messages: [null],
        idempotencyKey: "legacy-key",
      }),
    );

    render(<NewBook />);

    expect(screen.getByText("What do you want to write?")).toBeInTheDocument();
  });

  it("preserves an overlong restored style instruction and blocks creation", async () => {
    const overlong = "x".repeat(1_001);
    localStorage.setItem(
      "story:intake:user-a",
      JSON.stringify({
        version: 1,
        answers: {},
        messages: [{ type: "system", text: "Choose a starting style." }],
        questionIndex: 3,
        reply: "",
        selectedPresets: [],
        customInstruction: overlong,
        idempotencyKey: "legacy-key",
      }),
    );

    render(<NewBook />);

    const instruction = await screen.findByLabelText(/custom style instruction/i);
    expect(instruction).toHaveValue(overlong);
    expect(screen.getByRole("alert")).toHaveTextContent(/up to 1,000 characters/i);
    expect(screen.getByRole("button", { name: /create book/i })).toBeDisabled();
    expect(authenticatedFetchMock).not.toHaveBeenCalled();
  });

  it("preserves the draft when createBook returns an invalid success payload", async () => {
    authenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ bookId: "", openingSuggestion: "ok", openings: [] }), {
        status: 200,
      }),
    );
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A mystery inside a lighthouse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create book/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not create/i));
    expect(screen.queryByRole("button", { name: /continue to my book/i })).not.toBeInTheDocument();
    expect(localStorage.getItem("story:intake:user-a")).not.toBeNull();
  });

  it("clears the local intake draft after the book is created", async () => {
    render(<NewBook />);

    fireEvent.change(screen.getByLabelText(/reply/i), {
      target: { value: "A mystery inside a lighthouse" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create book/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /continue to my book/i })).toBeInTheDocument(),
    );
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["books"] });
    expect(localStorage.getItem("story:intake:user-a")).toBeNull();
  });
});

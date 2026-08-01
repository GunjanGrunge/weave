# Muse Readiness / Draft-on-Enough-Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Muse conversation's hardcoded "always ask a clarifying question" behavior with a scored-readiness classification: draft immediately when a narrative anchor exists, and only ask when there's a genuine blocker (no anchor at all, or a Story Bible conflict).

**Architecture:** `/consultMuse` gains a structured-JSON classification call (`classifyMuseReadiness`, modeled on the existing `generateOpeningSuggestions` JSON-schema pattern in `gemini.ts`) that returns `{ readiness: "draft" | "clarify", note }`. On `"clarify"` the existing question-persistence path runs unchanged. On `"draft"` the handler calls the *existing* `runGenerate` pipeline (the same one `/generateScene`'s free-text mode uses) with the writer's message as the description — reusing all existing prompt/context/persistence machinery, so the "one stitch at a time" prose constraints are untouched. The frontend's conversational mode gets the same response shape `/generateScene` already returns for `actionable` results, so it can render a `SceneReviewCard` directly from a Muse turn — no more manual "Draft next stitch" mode switch required to actually get prose.

**Tech Stack:** TypeScript, Firebase Cloud Functions v2, `@google/genai` (Gemini) + OpenAI Responses API, Vitest, React + TanStack Router.

## Global Constraints

- Do not change `composePrompt.ts`, the scene-length/quality preference system, or any Story Bible logic — only the readiness decision and response wiring change.
- Reuse `runGenerate`/`persistGeneratedCandidate` for all scene persistence in the draft path — do not write a second code path that persists `assistant_scene` messages.
- `idempotencyKey` handling must follow the exact validation already used in `generateScene.ts` (`parseInput`): optional, 8–128 chars, `^[A-Za-z0-9_-]+$`, else server-generated via `randomUUID()`.
- Every new/changed function needs a passing test before moving to the next task (TDD). Run `npm run test` inside `functions/` for backend tasks, `bun run vitest run <file>` at the repo root for frontend tasks.

---

### Task 1: `classifyMuseReadiness` in `functions/src/services/gemini.ts`

**Files:**
- Modify: `functions/src/services/gemini.ts` (add after `generateOpeningSuggestions`, i.e. after line 323 and before `export async function generateScene(`)
- Test: `functions/src/services/gemini.test.ts` (add a new `describe("classifyMuseReadiness", ...)` block after the existing `describe("generateOpeningSuggestions", ...)` block, i.e. after line 261-ish where that block's closing `});` is — insert before `describe("generateScene", ...)`)

**Interfaces:**
- Produces: `export type MuseReadiness = { readiness: "draft" | "clarify"; note: string; provider: "openai" | "gemini"; model: string }` and `export async function classifyMuseReadiness(bookId: string, prompt: string, apiKeys: AIProviderKeys): Promise<MuseReadiness>`, both exported from `gemini.ts`. Task 2 imports both.

- [ ] **Step 1: Write the failing test**

Add to `functions/src/services/gemini.test.ts`, immediately before the `describe("generateScene", ...)` block:

```ts
describe("classifyMuseReadiness", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    generateContentMock.mockReset();
    usageWrites.length = 0;
    usageDocIds.length = 0;
    registryData = validRegistry;
    usageWriteFailure.current = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests JSON-schema output from the registry's generate model and records usage as museConversation", async () => {
    const { classifyMuseReadiness } = await import("./gemini.js");
    fetchMock.mockResolvedValue(
      openAIResponseFor({ readiness: "draft", note: "Opening the farewell party." }),
    );

    const result = await classifyMuseReadiness("book-1", "some prompt", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result).toEqual({
      readiness: "draft",
      note: "Opening the farewell party.",
      provider: "openai",
      model: "gpt-5.6-terra",
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "gpt-5.6-terra",
      text: { format: { type: "json_schema", name: "muse_readiness" } },
    });
    expect(usageWrites).toEqual([
      expect.objectContaining({ task: "museConversation", provider: "openai" }),
    ]);
  });

  it("returns a clarify classification with its note", async () => {
    const { classifyMuseReadiness } = await import("./gemini.js");
    fetchMock.mockResolvedValue(
      openAIResponseFor({
        readiness: "clarify",
        note: "You mention a reunion, but the Story Bible has no such event yet — is this canon?",
      }),
    );

    const result = await classifyMuseReadiness("book-1", "some prompt", {
      openai: "fake-openai-key",
      gemini: "fake-gemini-key",
    });

    expect(result.readiness).toBe("clarify");
    expect(result.note).toContain("Story Bible");
  });

  it("throws GeminiError when the model returns an invalid readiness value", async () => {
    const { classifyMuseReadiness, GeminiError } = await import("./gemini.js");
    fetchMock.mockResolvedValue(openAIResponseFor({ readiness: "maybe", note: "hm" }));

    await expect(
      classifyMuseReadiness("book-1", "some prompt", {
        openai: "fake-openai-key",
        gemini: "fake-gemini-key",
      }),
    ).rejects.toBeInstanceOf(GeminiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/services/gemini.test.ts -t classifyMuseReadiness`
Expected: FAIL — `classifyMuseReadiness is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

In `functions/src/services/gemini.ts`, insert this block immediately after the closing brace of `generateOpeningSuggestions` (after line 323, before `export async function generateScene(`):

```ts
export type MuseReadiness = {
  readiness: "draft" | "clarify";
  note: string;
  provider: "openai" | "gemini";
  model: string;
};

const MUSE_READINESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    readiness: { type: "string", enum: ["draft", "clarify"] },
    note: { type: "string" },
  },
  required: ["readiness", "note"],
};

function parseMuseReadiness(
  responseText: string | undefined,
  provider = "AI",
): { readiness: "draft" | "clarify"; note: string } {
  if (!responseText) {
    throw new GeminiError(`${provider} response had no text content.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GeminiError(`${provider} response was not valid JSON.`);
  }
  const record = parsed as { readiness?: unknown; note?: unknown };
  if (
    (record.readiness !== "draft" && record.readiness !== "clarify") ||
    typeof record.note !== "string"
  ) {
    throw new GeminiError(`${provider} response did not contain a valid readiness classification.`);
  }
  return { readiness: record.readiness, note: record.note };
}

export async function classifyMuseReadiness(
  bookId: string,
  prompt: string,
  apiKeys: AIProviderKeys,
): Promise<MuseReadiness> {
  const registry = await readModelRegistry();
  const result = await callWithFallback(registry.generate, apiKeys, prompt, {
    name: "muse_readiness",
    schema: MUSE_READINESS_SCHEMA,
  });
  await recordUsageBestEffort(bookId, "museConversation", result);
  const classified = parseMuseReadiness(
    result.text,
    result.provider === "openai" ? "OpenAI" : "Gemini",
  );
  return { ...classified, provider: result.provider, model: result.model };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/services/gemini.test.ts -t classifyMuseReadiness`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full gemini.test.ts suite to confirm no regressions**

Run: `cd functions && npx vitest run src/services/gemini.test.ts`
Expected: all prior tests (`generateOpeningSuggestions`, `generateScene`, etc.) still PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/services/gemini.ts functions/src/services/gemini.test.ts
git commit -m "feat: add classifyMuseReadiness for structured draft/clarify classification"
```

---

### Task 2: Rewire `/consultMuse` to classify readiness and draft through `runGenerate`

**Files:**
- Modify: `functions/src/handlers/consultMuse.ts` (full-file rewrite below)
- Modify: `functions/src/handlers/consultMuse.test.ts` (full-file rewrite below)

**Interfaces:**
- Consumes: `classifyMuseReadiness(bookId, prompt, apiKeys): Promise<MuseReadiness>` from Task 1; `runGenerate(bookId, input, apiKeys, operation): Promise<RunGenerateResult>` from `functions/src/pipelines/generate.js` (already exists, unchanged).
- Produces: `ConsultMuseSuccess` now has a `mode: "clarify" | "draft"` discriminant. Task 3 (frontend `parseConsultMuseResponse`) depends on this exact shape.

- [ ] **Step 1: Write the failing test — replace `functions/src/handlers/consultMuse.test.ts` entirely**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  verifyIdTokenMock,
  getBookMock,
  getVisionDocumentMock,
  getMessagesMock,
  appendMuseConversationMock,
  classifyMuseReadinessMock,
  getCanonicalRosterMock,
  runGenerateMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getBookMock: vi.fn(),
  getVisionDocumentMock: vi.fn(),
  getMessagesMock: vi.fn(),
  appendMuseConversationMock: vi.fn(),
  classifyMuseReadinessMock: vi.fn(),
  getCanonicalRosterMock: vi.fn(),
  runGenerateMock: vi.fn(),
}));

vi.mock("../services/auth.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth.js")>("../services/auth.js");
  return { ...actual, verifyIdToken: verifyIdTokenMock };
});
vi.mock("../services/books.js", () => ({
  getBook: getBookMock,
  getVisionDocument: getVisionDocumentMock,
  getMessages: getMessagesMock,
  appendMuseConversation: appendMuseConversationMock,
}));
vi.mock("../services/gemini.js", () => ({ classifyMuseReadiness: classifyMuseReadinessMock }));
vi.mock("../services/storyBible.js", () => ({ getCanonicalRoster: getCanonicalRosterMock }));
vi.mock("../pipelines/generate.js", () => ({ runGenerate: runGenerateMock }));

import { AuthError } from "../services/auth.js";
import { buildConsultMuseResponse } from "./consultMuse.js";

const keys = { openai: "test", gemini: "test" };

describe("buildConsultMuseResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: "writer-1" });
    getBookMock.mockResolvedValue({ uid: "writer-1" });
    getVisionDocumentMock.mockResolvedValue({ theme: "crime", premise: "A borrowed car" });
    getMessagesMock.mockResolvedValue([{ type: "user", text: "Eric is afraid.", order: 0 }]);
    getCanonicalRosterMock.mockResolvedValue({ text: "Eric: anxious." });
  });

  it("persists an editorial Muse turn without generating manuscript prose when readiness is clarify", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "clarify",
      note: "What if the car makes Eric complicit?",
      provider: "openai",
      model: "gpt-test",
    });

    await expect(
      buildConsultMuseResponse(
        "Bearer valid",
        { bookId: "book-1", message: "Make Eric feel guilty." },
        keys,
      ),
    ).resolves.toEqual({
      statusCode: 200,
      body: {
        mode: "clarify",
        text: "What if the car makes Eric complicit?",
        provider: "openai",
        model: "gpt-test",
      },
    });
    expect(classifyMuseReadinessMock).toHaveBeenCalledWith(
      "book-1",
      expect.stringMatching(
        /Classify readiness as "draft"[\s\S]*RECENT CONVERSATION:[\s\S]*Eric is afraid/,
      ),
      keys,
    );
    expect(appendMuseConversationMock).toHaveBeenCalledWith(
      "book-1",
      "Make Eric feel guilty.",
      "What if the car makes Eric complicit?",
    );
    expect(runGenerateMock).not.toHaveBeenCalled();
  });

  it("drafts the next stitch through runGenerate when readiness is draft", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "draft",
      note: "Opening the farewell party.",
      provider: "openai",
      model: "gpt-test",
    });
    runGenerateMock.mockResolvedValue({
      status: "ok",
      actionable: true,
      sessionId: "session-1",
      messageId: "message-1",
      text: "The party was already loud when Eric arrived.",
      revision: 0,
      candidateStatus: "active",
      provider: "openai",
      model: "gpt-test",
    });

    const result = await buildConsultMuseResponse(
      "Bearer valid",
      { bookId: "book-1", message: "A young guy celebrating his farewell, settled in." },
      keys,
    );

    expect(result).toEqual({
      statusCode: 200,
      body: {
        mode: "draft",
        sessionId: "session-1",
        messageId: "message-1",
        text: "The party was already loud when Eric arrived.",
        provider: "openai",
        model: "gpt-test",
        revision: 0,
        status: "active",
        actionable: true,
      },
    });
    expect(runGenerateMock).toHaveBeenCalledWith(
      "book-1",
      { mode: "free-text", description: "A young guy celebrating his farewell, settled in." },
      keys,
      expect.objectContaining({
        userMessage: "A young guy celebrating his farewell, settled in.",
      }),
    );
    expect(appendMuseConversationMock).not.toHaveBeenCalled();
  });

  it("reports a failure when the draft pipeline fails", async () => {
    classifyMuseReadinessMock.mockResolvedValue({
      readiness: "draft",
      note: "",
      provider: "openai",
      model: "gpt-test",
    });
    runGenerateMock.mockResolvedValue({ status: "failed" });

    await expect(
      buildConsultMuseResponse("Bearer valid", { bookId: "book-1", message: "Go." }, keys),
    ).resolves.toMatchObject({ statusCode: 502 });
  });

  it("does not call the model for invalid input or unauthenticated requests", async () => {
    await expect(
      buildConsultMuseResponse("Bearer valid", { bookId: "book-1", message: "" }, keys),
    ).resolves.toMatchObject({ statusCode: 400 });
    verifyIdTokenMock.mockRejectedValue(new AuthError("Missing token"));
    await expect(
      buildConsultMuseResponse("", { bookId: "book-1", message: "Hello" }, keys),
    ).resolves.toMatchObject({ statusCode: 401 });
    expect(classifyMuseReadinessMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotencyKey", async () => {
    await expect(
      buildConsultMuseResponse(
        "Bearer valid",
        { bookId: "book-1", message: "Hello", idempotencyKey: "!!!" },
        keys,
      ),
    ).resolves.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run src/handlers/consultMuse.test.ts`
Expected: FAIL — old `buildConsultMuseResponse` doesn't call `classifyMuseReadiness`/`runGenerate` and returns the old response shape.

- [ ] **Step 3: Write minimal implementation — replace `functions/src/handlers/consultMuse.ts` entirely**

```ts
import { randomUUID } from "node:crypto";

import { onRequest } from "firebase-functions/v2/https";

import { allowedOrigins } from "../config/cors.js";
import { GOOGLE_API_KEY, OPENAI_API_KEY } from "../config/secrets.js";
import { runGenerate } from "../pipelines/generate.js";
import { verifyIdToken, assertOwnership, AuthError } from "../services/auth.js";
import {
  getBook,
  getVisionDocument,
  getMessages,
  appendMuseConversation,
} from "../services/books.js";
import { classifyMuseReadiness, type AIProviderKeys } from "../services/gemini.js";
import { getCanonicalRoster } from "../services/storyBible.js";

const MAX_MESSAGE_LENGTH = 4_000;

export type ConsultMuseSuccess =
  | { mode: "clarify"; text: string; provider: "openai" | "gemini"; model: string }
  | {
      mode: "draft";
      sessionId: string;
      messageId: string;
      text: string;
      provider: "openai" | "gemini";
      model: string;
      revision: number;
      status?: "active" | "accepted";
      actionable: boolean;
    };
type ConsultMuseError = { code: string; message: string };
export type ConsultMuseResult =
  | { statusCode: 200; body: ConsultMuseSuccess }
  | { statusCode: 202 | 400 | 401 | 404 | 502; body: ConsultMuseError };

function parseRequest(
  body: unknown,
): { bookId: string; message: string; idempotencyKey: string } | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const bookId = record.bookId;
  const message = record.message;
  if (
    typeof bookId !== "string" ||
    !bookId.trim() ||
    bookId.includes("/") ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return undefined;
  }
  const suppliedKey = record.idempotencyKey;
  if (
    suppliedKey !== undefined &&
    (typeof suppliedKey !== "string" ||
      suppliedKey.length < 8 ||
      suppliedKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(suppliedKey))
  ) {
    return undefined;
  }
  return {
    bookId: bookId.trim(),
    message: message.trim(),
    idempotencyKey: typeof suppliedKey === "string" ? suppliedKey : randomUUID(),
  };
}

function buildMusePrompt(input: {
  message: string;
  vision: Awaited<ReturnType<typeof getVisionDocument>>;
  roster: string;
  recentConversation: string;
}): string {
  return [
    "You are WEAVE's Muse: a seasoned novelist and developmental editor working alongside an author who wants you to write, not interview them.",
    'WEAVE builds a novel one small stitch at a time. Your job each turn is to classify whether there is enough to draft the next beat, then respond as JSON: { "readiness": "draft" | "clarify", "note": "..." }.',
    "Classify readiness as \"draft\" whenever the writer has given a narrative anchor for this beat: someone doing or feeling something, even loosely sketched (for example: 'a young guy celebrating his farewell, settled in'). Under-specified details such as name, exact setting, tone, or point of view are NOT blockers — invent sensible, reversible choices for them during drafting rather than asking about them here.",
    "Classify readiness as \"clarify\" ONLY when either: (a) the writer's message conflicts with an established Story Bible fact, or (b) there is no narrative anchor at all to write from (no one doing or feeling anything). Uncertainty from the writer such as \"I don't know\" or \"you decide\" is never a reason to clarify — treat it as license to invent.",
    "When readiness is \"clarify\", note must be 90 words or fewer: one short observation, then exactly one purposeful question or at most two compact options, addressing only the genuine blocker.",
    "When readiness is \"draft\", note may be a short one-sentence acknowledgment of what you're about to write, or an empty string.",
    "Never draft manuscript prose, a chapter, a scene, or a long plan in this response yourself — only classify and, if clarifying, ask. The actual prose is written by a separate drafting step.",
    "Do not invent canonical facts as settled; treat the Story Bible as authoritative.",
    "",
    `CURRENT VISION:\nTheme: ${input.vision?.theme || "not set"}\nPremise: ${input.vision?.premise || "not set"}`,
    input.roster
      ? `\nSTORY BIBLE:\n${input.roster}`
      : "\nSTORY BIBLE: No established characters yet.",
    input.recentConversation
      ? `\nRECENT CONVERSATION:\n${input.recentConversation}`
      : "\nRECENT CONVERSATION: This is the first exchange.",
    `\nWRITER: ${input.message}`,
  ].join("\n");
}

export async function buildConsultMuseResponse(
  authorizationHeader: string | undefined,
  body: unknown,
  apiKeys: AIProviderKeys,
): Promise<ConsultMuseResult> {
  try {
    const decoded = await verifyIdToken(authorizationHeader);
    const request = parseRequest(body);
    if (!request) {
      return {
        statusCode: 400,
        body: {
          code: "invalid-argument",
          message: "Include a bookId and a message up to 4,000 characters.",
        },
      };
    }
    const book = await getBook(request.bookId);
    if (!book) return { statusCode: 404, body: { code: "not-found", message: "Book not found." } };
    assertOwnership(decoded.uid, book.uid);

    const [vision, roster, messages] = await Promise.all([
      getVisionDocument(request.bookId),
      getCanonicalRoster(request.bookId).catch(() => ({ text: "" })),
      getMessages(request.bookId),
    ]);
    const recentConversation = messages
      .slice(-12)
      .map(
        (message) =>
          `${message.type === "user" ? "WRITER" : "MUSE"}: ${message.text.slice(0, 800)}`,
      )
      .join("\n");
    const classification = await classifyMuseReadiness(
      request.bookId,
      buildMusePrompt({
        message: request.message,
        vision,
        roster: roster.text,
        recentConversation,
      }),
      apiKeys,
    );

    if (classification.readiness === "clarify") {
      await appendMuseConversation(request.bookId, request.message, classification.note);
      return {
        statusCode: 200,
        body: {
          mode: "clarify",
          text: classification.note,
          provider: classification.provider,
          model: classification.model,
        },
      };
    }

    const result = await runGenerate(
      request.bookId,
      { mode: "free-text", description: request.message },
      apiKeys,
      { idempotencyKey: request.idempotencyKey, userMessage: request.message },
    );
    if (result.status === "in-progress") {
      return {
        statusCode: 202,
        body: {
          code: "generation-in-progress",
          message: "This generation is still in progress. Retry shortly.",
        },
      };
    }
    if (result.status !== "ok") {
      return {
        statusCode: 502,
        body: { code: "generation-failed", message: "Scene generation failed or timed out." },
      };
    }
    return {
      statusCode: 200,
      body: {
        mode: "draft",
        sessionId: result.sessionId,
        messageId: result.messageId,
        text: result.text,
        provider: result.provider,
        model: result.model,
        revision: result.revision,
        status: result.actionable ? result.candidateStatus : undefined,
        actionable: result.actionable,
      },
    };
  } catch (error) {
    if (error instanceof AuthError) {
      return { statusCode: 401, body: { code: error.code, message: error.message } };
    }
    console.error("consultMuse failed", error);
    return {
      statusCode: 502,
      body: { code: "muse-unavailable", message: "The Muse is unavailable right now." },
    };
  }
}

export const consultMuse = onRequest(
  {
    cors: allowedOrigins(),
    region: "us-central1",
    timeoutSeconds: 180,
    secrets: [GOOGLE_API_KEY, OPENAI_API_KEY],
  },
  async (request, response) => {
    const result = await buildConsultMuseResponse(request.headers.authorization, request.body, {
      gemini: GOOGLE_API_KEY.value(),
      openai: OPENAI_API_KEY.value(),
    });
    response.status(result.statusCode).json(result.body);
  },
);
```

Note: `timeoutSeconds` is raised from 120 to 180 because the draft path now makes two sequential model calls (classification, then generation via `runGenerate`) instead of one.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run src/handlers/consultMuse.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full functions test suite**

Run: `cd functions && npm run test`
Expected: all tests PASS (no other file imports `generateScene` from `consultMuse.ts`, so this is a contained change).

- [ ] **Step 6: Commit**

```bash
git add functions/src/handlers/consultMuse.ts functions/src/handlers/consultMuse.test.ts
git commit -m "feat: draft through runGenerate when Muse readiness classifies as draft"
```

---

### Task 3: Frontend response parsing — `parseConsultMuseResponse`

**Files:**
- Modify: `src/lib/scene-api.ts` (add after `parseGeneratedScene`, i.e. after line 215)
- Test: `src/lib/scene-api.test.ts`

**Interfaces:**
- Consumes: existing `parseGeneratedScene`, `GeneratedScene`, `DegradedGeneratedScene`, `provider()`, `record()` from the same file.
- Produces: `export type ConsultMuseResponse = { mode: "clarify"; text: string; provider: "openai" | "gemini"; model: string } | { mode: "draft"; scene: GeneratedScene | DegradedGeneratedScene }` and `export function parseConsultMuseResponse(value: unknown): ConsultMuseResponse | undefined`. Task 4 imports both.

- [ ] **Step 1: Write the failing test**

Read `src/lib/scene-api.test.ts` first to match its existing style (mock/import conventions), then append:

```ts
describe("parseConsultMuseResponse", () => {
  it("parses a clarify response", () => {
    const result = parseConsultMuseResponse({
      mode: "clarify",
      text: "What does Eric stand to lose?",
      provider: "openai",
      model: "gpt-test",
    });
    expect(result).toEqual({
      mode: "clarify",
      text: "What does Eric stand to lose?",
      provider: "openai",
      model: "gpt-test",
    });
  });

  it("parses an actionable draft response using the same shape as generateScene", () => {
    const result = parseConsultMuseResponse({
      mode: "draft",
      sessionId: "session-1",
      messageId: "message-1",
      text: "The party was already loud when Eric arrived.",
      provider: "openai",
      model: "gpt-test",
      revision: 0,
      status: "active",
      actionable: true,
    });
    expect(result).toEqual({
      mode: "draft",
      scene: {
        sessionId: "session-1",
        messageId: "message-1",
        text: "The party was already loud when Eric arrived.",
        provider: "openai",
        model: "gpt-test",
        revision: 0,
        status: "active",
        actionable: true,
      },
    });
  });

  it("returns undefined for an unrecognized mode", () => {
    expect(parseConsultMuseResponse({ mode: "unknown" })).toBeUndefined();
  });

  it("returns undefined for a malformed clarify response", () => {
    expect(parseConsultMuseResponse({ mode: "clarify", text: "" })).toBeUndefined();
  });
});
```

Add `parseConsultMuseResponse` to the existing top-of-file import from `./scene-api` (or wherever the test file imports the module under test).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run vitest run src/lib/scene-api.test.ts -t parseConsultMuseResponse`
Expected: FAIL — `parseConsultMuseResponse` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/scene-api.ts`, insert immediately after `parseGeneratedScene`'s closing brace (after line 215):

```ts
export type ConsultMuseResponse =
  | { mode: "clarify"; text: string; provider: "openai" | "gemini"; model: string }
  | { mode: "draft"; scene: GeneratedScene | DegradedGeneratedScene };

export function parseConsultMuseResponse(value: unknown): ConsultMuseResponse | undefined {
  const item = record(value);
  if (!item) return undefined;
  if (item.mode === "clarify") {
    const parsedProvider = provider(item.provider);
    return typeof item.text === "string" && item.text.length > 0 && parsedProvider && typeof item.model === "string"
      ? { mode: "clarify", text: item.text, provider: parsedProvider, model: item.model }
      : undefined;
  }
  if (item.mode === "draft") {
    const scene = parseGeneratedScene(item);
    return scene ? { mode: "draft", scene } : undefined;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run vitest run src/lib/scene-api.test.ts`
Expected: PASS, including all pre-existing tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scene-api.ts src/lib/scene-api.test.ts
git commit -m "feat: parse the mode-discriminated consultMuse response"
```

---

### Task 4: Chat UI — conversational mode can render a draft directly

**Files:**
- Modify: `src/routes/books.$bookId.chat.tsx`
- Modify: `src/routes/books.$bookId.chat.test.tsx`

**Interfaces:**
- Consumes: `parseConsultMuseResponse` and `ConsultMuseResponse` from `@/lib/scene-api` (Task 3).

- [ ] **Step 1: Write the failing tests — add to `src/routes/books.$bookId.chat.test.tsx`**

First, update the existing test's mocked `/consultMuse` response body to the new contract (find `.mockResolvedValueOnce(response({ text: "That gives us a strong pressure point. What does Eric stand to lose?" }))` in the "defaults to an editorial conversation..." test and change it to):

```ts
      .mockResolvedValueOnce(
        response({
          mode: "clarify",
          text: "That gives us a strong pressure point. What does Eric stand to lose?",
          provider: "openai",
          model: "gpt-test",
        }),
      );
```

Then add two new tests to the `describe("ChatPage", ...)` block:

```ts
  it("renders an actionable scene draft directly from a conversational turn when Muse classifies readiness as draft", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(
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
    authenticatedFetchMock
      .mockResolvedValueOnce(response({ messages: [] }))
      .mockResolvedValueOnce(
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run vitest run src/routes/books.\$bookId.chat.test.tsx`
Expected: FAIL — current code throws on `typeof result?.text !== "string"` (the new mock body has no top-level `text` in the draft case) or renders a `structural_note` bubble instead of a `SceneReviewCard`.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/books.$bookId.chat.tsx`:

1. Add the import (alongside the existing `parseChatMessages, parseGeneratedScene` import line):

```ts
import {
  parseChatMessages,
  parseConsultMuseResponse,
  parseGeneratedScene,
  type ChatMessage,
} from "@/lib/scene-api";
```

2. Replace the entire `if (inputMode === "conversation") { ... }` block inside `submitScene` (the block that currently ends with the `return;` right before `const hasStructuredValue = ...`) with:

```ts
    if (inputMode === "conversation") {
      if (!trimmedDescription) {
        setValidationError("Tell the Muse what you are considering.");
        return;
      }
      setValidationError(null);
      setGenerationState({ status: "loading" });
      const requestBookId = bookId;
      const requestRouteVersion = routeVersionRef.current;
      const inputSnapshot = JSON.stringify({ bookId, message: trimmedDescription });
      if (generationRequestRef.current?.inputSnapshot !== inputSnapshot) {
        generationRequestRef.current = { key: `consult-${crypto.randomUUID()}`, inputSnapshot };
      }
      const idempotencyKey = generationRequestRef.current.key;
      try {
        const response = await authenticatedFetch("/consultMuse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId, message: trimmedDescription, idempotencyKey }),
        });
        const body = await response.json().catch(() => undefined);
        const result = response.ok ? parseConsultMuseResponse(body) : undefined;
        if (!result) {
          throw new Error("Muse conversation failed.");
        }
        if (
          activeBookIdRef.current !== requestBookId ||
          routeVersionRef.current !== requestRouteVersion
        ) {
          return;
        }
        setLoadState((current) => {
          const priorMessages = current.status === "ready" ? current.messages : [];
          const nextOrder = priorMessages.length;
          const assistantMessage: ChatMessage =
            result.mode === "clarify"
              ? { type: "structural_note", text: result.text, order: nextOrder + 1 }
              : result.scene.actionable
                ? {
                    id: result.scene.messageId,
                    type: "assistant_scene",
                    text: result.scene.text,
                    order: nextOrder + 1,
                    sessionId: result.scene.sessionId,
                    revision: result.scene.revision,
                    status: result.scene.status,
                    provider: result.scene.provider,
                    model: result.scene.model,
                    ...(result.scene.previousAttempt
                      ? { previousAttempt: result.scene.previousAttempt }
                      : {}),
                  }
                : { type: "assistant_scene", text: result.scene.text, order: nextOrder + 1 };
          return {
            status: "ready",
            messages: [
              ...priorMessages,
              { type: "user", text: trimmedDescription, order: nextOrder },
              assistantMessage,
            ],
          };
        });
        generationRequestRef.current = null;
        setDescription("");
        setGenerationState({ status: "idle" });
      } catch {
        if (
          activeBookIdRef.current === requestBookId &&
          routeVersionRef.current === requestRouteVersion
        ) {
          setGenerationState({
            status: "error",
            message: "The Muse could not respond. Your thought is still here.",
          });
        }
      }
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run vitest run src/routes/books.\$bookId.chat.test.tsx`
Expected: PASS (5 tests: the 3 original plus the 2 new ones).

- [ ] **Step 5: Run the full frontend suite**

Run: `bun run vitest run`
Expected: all test files PASS (this touches `ChatPage`, which `WriteWorkspace` composes — confirm `src/components/book/WriteWorkspace.test.tsx` still passes unchanged).

- [ ] **Step 6: Typecheck**

Run: `bun run tsc --noEmit -p tsconfig.json`
Expected: no new errors beyond the pre-existing unrelated ones in `scene-api.ts`/`manuscript.test.tsx` (confirm via `git stash` diff if unsure, same as the WriteWorkspace change earlier).

- [ ] **Step 7: Commit**

```bash
git add src/routes/books.\$bookId.chat.tsx src/routes/books.\$bookId.chat.test.tsx
git commit -m "feat: render Muse drafts directly in conversational mode"
```

---

### Task 5: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd functions && npm run verify`
Expected: lint, seam lint, build, and test all PASS.

- [ ] **Step 2: Run the full frontend suite**

Run: `bun run vitest run && bun run tsc --noEmit -p tsconfig.json && bun run lint`
Expected: tests PASS; no new type or lint errors versus the pre-change baseline (`git stash` + rerun to compare if any are ambiguous).

- [ ] **Step 3: Manual smoke check of the prompt text (no live model call needed for this plan)**

Read back `buildMusePrompt`'s output for a minimal input (e.g. via a throwaway `console.log` in a scratch script or by re-reading the string literals in `consultMuse.ts`) and confirm it reads coherently end-to-end — this is a human-review step since prompt quality can't be asserted by a unit test.

- [ ] **Step 4: Commit the plan file itself if not already tracked**

```bash
git add docs/superpowers/plans/2026-08-01-muse-readiness-drafting.md
git commit -m "docs: add Muse readiness/drafting implementation plan"
```

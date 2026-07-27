---
baseline_commit: "8239fba"
---

# Story 2.1: Turn a Scene Description Into a Scene

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a writer who can picture a scene but not the words,
I want to describe what happens in plain text and get the full scene written in my book's style,
so that the blocker between imagination and finished prose disappears.

## Acceptance Criteria

1. **Given** my Book is open in the Chat, **When** I submit a non-empty free-text scene description, **Then** the Generate pipeline (LangGraph: `assembleContext` → `composePrompt` → `generateScene` → `persistSession`) returns scene prose in the Book's active Style as an `assistant_scene` chat message, with a loading state throughout and a visible response within ~15 seconds for typical scene length (NFR-4).
2. **Given** the same request, **When** the pipeline assembles context, **Then** the assembled context is the graceful-degradation set — Book metadata, Vision Document with open Threads, the active Chapter's scenes, and the current Style — never any full-manuscript concatenation (AD-3).
3. **Given** the same request, **When** context assembly completes, **Then** it is persisted server-side keyed by an opaque session id returned to the client; the context itself never reaches the browser (AD-4).
4. **Given** the same request, **When** the scene is generated, **Then** the call is made through `services/gemini.ts` using the registry's `generate` task (per the amended AD-9: primary `openai:gpt-5.6-sol`, fallback `gemini:gemini-2.5-pro`) and logged to `books/{bookId}/usage` with `provider` and `model` recorded.
5. **Given** I submit an empty description, **When** I try to send, **Then** it is blocked client-side with a message and no API call occurs (FR-2).
6. **Given** the Gemini/OpenAI call fails or times out, **When** the error surfaces, **Then** I see a clear error with an explicit retry option and my typed description is still in the input, unlost (NFR-1).

## Tasks / Subtasks

- [x] Task 0: Establish the per-book Chat route (AC: 1, 5, 6)
  - [x] Added `src/routes/books.$bookId.chat.tsx` as the real Book Chat surface (flat route, matching `books.$bookId.vision.tsx`).
  - [x] On load, fetches existing chat messages via `/getMessages`.
  - [x] `src/routes/books.tsx`'s mock `books` array is empty (`[]`), so there were no real-book shelf links to repoint; left untouched per the "leave mock cards alone if they carry no real id" guidance.
  - [x] `books.new.tsx`'s intake flow untouched.

- [x] Task 1: Add a message-listing read path (AC: 1)
  - [x] Added `getMessages(bookId): Promise<ChatMessage[]>` to `functions/src/services/books.ts`, querying `books/{bookId}/messages` ordered by `order` ascending.
  - [x] Added `handlers/getMessages.ts` (verify token, load book, `assertOwnership`, return messages). Exported from `functions/src/index.ts`; added the `/getMessages` Hosting rewrite.
  - [x] No AI secrets bound; plain read only.

- [x] Task 2: Add `assembleContext` types and node (AC: 1, 2)
  - [x] Added `functions/src/pipelines/assembleContext.ts`. **Design note (see Dev Notes):** per AD-4's "regenerate always reads live Style/Vision/threads" rule, `assembleContext`'s cached output is scoped to the retrieval-only half (`chapterId`, `priorScenesText`) — Book/Vision/Style/Threads are read live by `composePrompt` instead, every call, not just on regenerate.
  - [x] Added `functions/src/types/scene.ts` and `getActiveChapterScenes(bookId)` in `services/books.ts`.
  - [x] Never concatenates any prior chapter's full text; only the active (lowest-`order`) chapter's scenes are read.

- [x] Task 3: Add `composePrompt` node with the free-text template (AC: 1, 2)
  - [x] Added `functions/src/pipelines/composePrompt.ts`, free-text template only.
  - [x] Reads Book + Vision live (every call, per AD-4), resolves style via `stylePresets.ts`, includes open threads only (`paid_off` excluded) with subtlety-aware instruction text per thread.
  - [x] Style resolution reuses `functions/src/config/stylePresets.ts`; no duplicated preset list.
  - [x] Final prompt composed from style + theme/premise/character intents + open threads + prior scenes (verbatim) + free-text description.

- [x] Task 4: Add `generateScene` node and extend `services/gemini.ts` (AC: 1, 4, 6)
  - [x] Refactored `callOpenAIModel`/`callGeminiModel` into schema-optional `callOpenAIRaw`/`callGeminiRaw` returning raw text; `generateOpeningSuggestions` now calls the shared raw path + `parseOpenings`, `generateScene` calls it with no schema. `parseOpenings`/`OPENING_SUGGESTION_SCHEMA` unchanged.
  - [x] Added `generateScene(bookId, prompt, apiKeys)` using the registry's `generate` task with the shared `callWithFallback` primary/fallback helper.
  - [x] `recordUsage` now takes an optional `docId`: `openingSuggestion` keeps its fixed id (`"openingSuggestion"`) for retry-idempotency; `generate` omits it, so each call gets a fresh auto-id usage doc (verified in tests — two `generateScene` calls produce two separate usage writes, not one overwritten doc).

- [x] Task 5: Add `persistSession` node and the Generate pipeline graph (AC: 1, 3)
  - [x] Added `functions/src/pipelines/generate.ts` — LangGraph `StateGraph` with nodes `assembleContext` → `composePrompt` → `generateScene` → `persistSession`, matching `intake.ts`'s single-file pattern.
  - [x] `persistSession` writes `{ chapterId, assembledContext: { priorScenesText }, composedPrompt }` to an auto-id doc under `books/{bookId}/sessions`; only the returned `sessionId` crosses the pipeline boundary — verified by a test asserting the result never contains the prompt or assembled context.
  - [x] No `scenes` write in this story; pipeline output is `{ status, text, provider, model, sessionId }` only.

- [x] Task 6: Add the `generateScene` HTTP handler (AC: 1, 4, 5, 6)
  - [x] Added `functions/src/handlers/generateScene.ts`: verify token → parse `{ bookId, description }` (400 on empty/whitespace description or missing bookId) → `assertOwnership` → run pipeline with a 25s timeout wrapper → append `assistant_scene` chat message via `appendChatMessage` → return `{ sessionId, text, provider, model }`.
  - [x] Pipeline failure/timeout returns `502 { code: "generation-failed", message }`, never throws/500.
  - [x] Exported from `functions/src/index.ts`; added `/generateScene` Hosting rewrite; both `GOOGLE_API_KEY` and `OPENAI_API_KEY` bound.

- [x] Task 7: Build the Chat frontend generation UI (AC: 1, 5, 6)
  - [x] `books.$bookId.chat.tsx` renders message history by `ChatMessage.type` (user/assistant_scene/structural_note/system get distinct styling), a free-text textarea, and a Send button.
  - [x] Client-side blocks empty/whitespace-only submissions with an inline `role="alert"` message; no fetch fires.
  - [x] Loading state ("Writing your scene…" + spinner) shown for the full `/generateScene` round-trip.
  - [x] On success, appends user + assistant_scene messages locally and keeps `sessionId` in state.
  - [x] On failure, shows an inline error + Retry button and does not clear the textarea.

- [x] Task 8: Tests (AC: 1, 2, 3, 4, 5, 6)
  - [x] `assembleContext.test.ts` (3 tests): active-chapter scenes in order, empty-scenes degrade, no-chapters degrade.
  - [x] `composePrompt.test.ts` (4 tests): style + custom instruction resolution, open-vs-paid-off thread filtering with subtlety text, prior scenes verbatim, undefined on missing book/vision.
  - [x] `gemini.test.ts` extended (+4 tests, 9 total, all passing including the pre-existing 5): `generateScene` primary/fallback/both-fail, and an explicit auto-id-vs-fixed-id usage-doc assertion.
  - [x] `generateScene.test.ts` (8 tests): success + message append, empty/whitespace 400, missing bookId 400, 401, 404, cross-owner 401, pipeline-failure 502, timeout 502.
  - [x] `books.$bookId.chat.test.tsx` (5 tests): loads existing messages, blocks empty submit, blocks whitespace submit, renders successful generation, shows error+Retry with input preserved.
  - [x] Also added `getMessages.test.ts` (5 tests) and extended `books.test.ts` (+8 tests: `getMessages`, `appendChatMessage`, `getActiveChapterScenes`) and `generate.test.ts` (4 tests, the pipeline graph itself).

- [x] Task 9: Verify and deploy (AC: 1–6)
  - [x] `npm run verify` in `functions/` passed: lint, seam lint, build, 15 files / 91 tests.
  - [x] `bun run test` at repo root passed: 9 files / 38 tests. `bun run build` passed (pre-existing chunk-size warning only).
  - [ ] Push to `main` and confirm CI/CD deploy passes.
  - [ ] Live-verify with one writer account and clean up disposable data.

## Dev Notes

### Scope Boundaries

This story ships the free-text input mode (FR-2) end-to-end, including the Chat surface itself (which did not exist before this story) and the shared pipeline skeleton (`assembleContext` → `composePrompt` → `generateScene` → `persistSession`) that Stories 2.2 (structured-fields), 2.3 (draft-polish), and 2.4 (edit/regenerate/accept) will extend rather than rebuild. It does **not** implement: structured-field or draft-polish input modes (2.2/2.3), inline edit/regenerate/accept or scene persistence into `scenes` (2.4), Style Engine UI for changing style mid-book (2.5 — this story only *reads* the existing style set at intake), the usage indicator UI (2.6 — this story only writes the usage log entry Task 4 requires), and FR-11's full context assembly (facts/embeddings/chapter summaries — Epic 3). Muse notes and thread-subtlety enforcement in prose are Epic 3; this story's `composePrompt` includes open threads with subtlety-aware instructions because that's a `composePrompt`-node-level concern per AD-11, but no dedicated enforcement testing beyond "instructions are present" is expected here.

### Architecture Compliance

- **AD-1**: no new compute provider or language runtime. All new code is TypeScript in `functions/` and the Vite frontend.
- **AD-3**: assembled context is strictly the graceful-degradation set (book metadata + vision/open-threads + active-chapter scenes + style) — never broader. There is only one chapter in scope for this story, so "never a prior chapter's full text" is currently vacuously satisfied but the code must not special-case it away — write it so it still holds once Story 3.2 adds chapters.
- **AD-4**: the assembled context and composed prompt are persisted server-side (`persistSession`), keyed by an opaque session id; only that id crosses to the client. Do not have the handler return context/prompt content directly, even for debugging.
- **AD-5**: this story's Generate pipeline is a direct request/response call (the user is waiting for their scene) — it is NOT the async/event-triggered pattern; that pattern applies to FR-9/FR-11 background work (Epic 3), which this story does not touch.
- **AD-6**: no new top-level collections. `sessions` (Task 5) and `scenes` (Task 2, type only — no writes yet) are new subcollections of `books/{bookId}` and `chapters/{chapterId}` respectively, consistent with the containment model. `order` fields are explicit numeric, never array position.
- **AD-9 (amended 2026-07-27 this session)**: the `generate` task's primary is `openai:gpt-5.6-sol` with fallback `gemini:gemini-2.5-pro` — call it through `services/gemini.ts`'s registry read, exactly like `openingSuggestion` does. Every Scene-producing call records `provider` and `model` in the usage log; this story's `generate` calls do not yet write a `modelUsed` field onto a persisted Scene document because no Scene document is created yet (that's Story 2.4) — but the pipeline's returned data must carry `provider`/`model` so 2.4 can attach it when it persists.
- **AD-11**: facts (none exist yet) and threads are architecturally separate; only threads are available to this story's `composePrompt`, with subtlety-aware prompt roles — never merge a thread's `meaning` into anything resembling a "fact."
- Seam rule (unchanged): `handlers/` never touches Firestore directly; `pipelines/` nodes never touch the HTTP response; all provider calls go through `services/gemini.ts`.

### Current Code State To Preserve

- `functions/src/services/gemini.ts` (`8af1d17`, amended by this story's AD-9 update) already implements the dual-provider primary/fallback pattern for `openingSuggestion` — `generateScene`'s new call path must reuse (not duplicate) `callOpenAIModel`/`callGeminiModel`-shaped logic; refactor those into text-returning variants shared with the existing JSON-schema opening-suggestion path if that keeps the diff clean, but do not break `generateOpeningSuggestions`'s existing behavior or its tests.
- `services/gemini.ts`'s `recordUsage` currently writes to a **fixed** doc id per task (`usage.doc(task).set(...)`) — this was a deliberate Story 1.4 fix for retry-idempotency on the one-shot `openingSuggestion` call. `generate` fires repeatedly per book and must NOT reuse that fixed-id pattern, or every scene's usage entry will overwrite the last.
- `functions/src/pipelines/intake.ts` is the only existing pipeline; it shows the project's StateGraph pattern (single file, `Annotation.Root` state, node functions, linear graph). Follow this shape for the new Generate pipeline rather than inventing a new structure.
- `src/routes/books.new.tsx` and `src/routes/books.$bookId.vision.tsx` are the two real (non-mock) frontend routes and share conventions worth reusing: `authenticatedFetch` for all backend calls (never client Firestore SDK), `Loader2`/status-driven render branches, `ArrowLeft` back-link to `/books`, Tailwind utility classes matching the existing card/border style (`rounded-md border border-border bg-card`).
- `src/routes/chat.tsx`, `src/routes/write.tsx`, and the shelf's mock `books` data (`src/lib/mock-data`) are Lovable-scaffold placeholders, not wired to any backend. Do not extend `chat.tsx` itself — it is a generic, non-book-scoped demo page; build the real surface at `books.$bookId.chat.tsx` instead. Leave `write.tsx` and the mock shelf otherwise alone.
- `firestore.rules`/security rules are unchanged by this story (no new client-side Firestore access is introduced — everything routes through Cloud Functions per the established pattern).

### Data Shape

```ts
// functions/src/types/scene.ts (new)
type Scene = {
  text: string;
  order: number;
  modelUsed: string;
  provider: "openai" | "gemini";
  createdAt: unknown;
};
```

Session doc (`books/{bookId}/sessions/{sessionId}`, new, auto-id):

```ts
type GenerationSession = {
  bookId: string;
  chapterId: string;
  assembledContext: {
    style: string; // resolved single instruction string
    visionSummary: { theme: string; premise: string; characterIntents: string[] };
    openThreads: Array<{ surface: string; meaning: string; subtlety: string }>;
    priorScenesText: string[]; // active chapter's scenes so far, verbatim
  };
  composedPrompt: string;
  createdAt: unknown;
};
```

Exact field names are implementation's to finalize; the invariant that must hold is: this document holds retrieval/prompt output only, and no field of it is ever returned to the client directly (only its id is).

### Testing Notes

- Follow the existing test doubles/style in `functions/src/services/gemini.test.ts` (hoisted mocks for `@google/genai`, `firebase-admin/*`, and `fetch` for the OpenAI path) when extending it for `generateScene`.
- Follow `functions/src/handlers/createBook.test.ts` for handler-level request/response shape testing (`buildXResponse` pure functions, tested independently of the `onRequest` wrapper).
- Follow `src/routes/books.new.test.tsx` / `src/routes/books.$bookId.vision.test.tsx` for frontend route testing conventions (mock `authenticatedFetch`, assert on rendered states).
- Firestore Rules unit tests remain deferred (no confirmed Java/emulator path in this environment, per Story 1.5's note) — do not mark rules tests complete unless they actually run.

### Previous Story Intelligence

- Story 1.4's review found a timeout/retry race on the one-shot opening-suggestion call, fixed by bounding the retry with a timeout and making usage recording idempotent via a fixed doc id. That fixed-doc-id idempotency trick does **not** transfer to `generate` — see the "Current Code State To Preserve" note above. Do not copy that pattern verbatim without adapting it for per-call (not idempotent-single-call) logging.
- Story 1.5 confirmed (in its own Dev Notes) that the OpenAI-primary model registry switch was intentional, made outside a formal story, and that `ARCHITECTURE-SPINE.md` had not yet been amended to reflect it at that time. This story's dev-agent session amended AD-9 and the Stack table in `ARCHITECTURE-SPINE.md` (2026-07-27) to close that gap — treat AD-9 as currently reflecting the live `services/gemini.ts` behavior; do not re-flag the OpenAI-primary setup as an inconsistency.
- CI deploy is automatic on push to `main` (`.github/workflows/firebase-deploy.yml`); do not run ad hoc broad deploy commands unless the workflow fails.
- No `Scene`/`scenes` type or collection exists anywhere yet — this is genuinely new domain surface, not a rename/extension of something existing. Build it to match `Chapter`'s minimal style (`{ order, createdAt }` plus this story's fields) rather than over-modeling for Story 2.4/2.5's needs.

### References

- `_bmad-output/planning-artifacts/epics.md#Story-2.1-Turn-a-Scene-Description-Into-a-Scene`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-3`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-4`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-5`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-9` (amended this session)
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-11`
- `_bmad-output/implementation-artifacts/1-5-see-and-shape-my-books-vision.md`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-27: Created Story 2.1 context from Epic 2 backlog; amended `ARCHITECTURE-SPINE.md` AD-9 and Stack table to formally reconcile the already-live OpenAI-primary model registry (verified `gpt-5.6-sol/terra/luna` and `gpt-5.4-nano` as real, current OpenAI model IDs via web search before amending).
- 2026-07-27: Implemented the Generate pipeline (assembleContext → composePrompt → generateScene → persistSession), the `generateScene`/`getMessages` handlers, and the `books.$bookId.chat.tsx` Chat surface. `npm run verify` (15 files/91 tests) and `bun run test`/`bun run build` (9 files/38 tests) passed. Pushed to `weave/main`; CI deploy `30246986163` failed (Hosting rewrite referenced two Cloud Functions not yet in the deploy workflow's `--only` allowlist); fixed the workflow and redeployed successfully (`30247207276`).
- 2026-07-27: Live verification found `generate`'s primary model (`gpt-5.6-sol`, the frontier reasoning tier) completed successfully but took longer than a 25s handler timeout for full scene prose, missing the ~15s NFR-4 target. Switched `generate`'s primary to `gpt-5.6-terra` (the balanced tier, already proven fast for `openingSuggestion`) and raised the handler's internal timeout to 55s for headroom; updated `seedModelRegistry.mjs` and AD-9 accordingly.

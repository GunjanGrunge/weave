---
baseline_commit: "743c1a6"
---

# Story 2.2: Build a Scene From Quick Details

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a writer who thinks in fragments,
I want to answer quick prompts — scene goal, mood, POV, setting — and get a scene from those alone,
so that I can write even when I can't articulate the scene as a paragraph.

## Acceptance Criteria

1. **Given** my Book is open in the Chat, **When** I choose the structured-details mode, **Then** the Chat offers quick-fill prompts for at least scene goal, mood, POV/character, and setting, answerable within the same Chat surface (no separate form/screen — FR-3's single chat-first-surface constraint).
2. **Given** I have supplied at least one detail, **When** I generate, **Then** the same Generate pipeline (`assembleContext` → `composePrompt` → `generateScene` → `persistSession`) runs with the structured-fields prompt template, and the resulting scene reflects the supplied details (a "tense" mood produces recognizably tense prose).
3. **Given** I have supplied no details at all, **When** I try to generate, **Then** submission is blocked client-side with a message and no API call occurs — mirroring Story 2.1's empty-free-text block.
4. **Given** either input mode, **When** the scene is generated, **Then** the call is made through `services/gemini.ts`'s `generate` task exactly as in Story 2.1 (same model registry entry, same per-call usage logging, same session persistence, same resilience to a downstream write failure), and the assembled context remains the AD-3 graceful-degradation set (Book metadata, Vision Document with open Threads, active Chapter's scenes, current Style) regardless of which input mode produced the prompt.
5. **Given** the Gemini/OpenAI call fails or times out in structured mode, **When** the error surfaces, **Then** the same clear-error-with-retry behavior from Story 2.1 applies, and the supplied field values are not lost (mirroring "typed description is still in the input" for the structured fields).

## Tasks / Subtasks

- [x] Task 0: Introduce a `SceneInput` discriminated union shared by the pipeline and handler (AC: 2, 4)
  - [x] Added `functions/src/types/sceneInput.ts`: `SceneInput = { mode: "free-text"; description: string } | { mode: "structured"; fields: StructuredSceneFields }`. Reused across handler → pipeline → composePrompt.

- [x] Task 1: Extend `composePrompt.ts` with the structured-fields template (AC: 2, 4)
  - [x] Signature changed to take `input: SceneInput`. Extracted shared style/vision/threads/prior-scenes lines into `buildSharedLines`; free-text vs structured input lines appended via `appendInputLines`. All 4 original free-text tests preserved (call sites updated to wrap the string in `{ mode: "free-text", description }`).
  - [x] Structured branch only prints present fields (`Scene goal:`/`Mood:`/`POV/character:`/`Setting:`), each on its own line, plus a closing instruction line. `mood` gets an explicit directive: "Write this scene with a {mood} emotional register throughout."

- [x] Task 2: Thread `SceneInput` through the Generate pipeline (AC: 2, 4)
  - [x] `GenerateState`'s `description: Annotation<string>` replaced with `input: Annotation<SceneInput>`; `runGenerate(bookId, input, apiKeys)`. `composePromptNode` passes `state.input`. Story 2.1's code-review fixes (`persistSessionNode`'s try/catch returning `{}`, `console.error` in `composePromptNode`/`generateSceneNode`) untouched — verified by re-reading the file before editing.

- [x] Task 3: Extend the `generateScene` HTTP handler to accept both input modes (AC: 2, 3, 4, 5)
  - [x] `parseInput` now branches on `record.mode === "structured"` (anything else, including omitted, defaults to free-text — preserves Story 2.1 request-shape compatibility). Structured validation: each present field trimmed and capped at `MAX_DESCRIPTION_LENGTH` (reused, not duplicated); at least one non-empty field required or 400.
  - [x] `summarizeSceneInput` builds the persisted "user" message: free-text passes the description through; structured joins only present fields as `Label: value.` in `sceneGoal, mood, povCharacter, setting` order.
  - [x] Story 2.1's `appendChatMessage` try/catch (still returns the generated scene on a persistence failure) and `runGenerateWithTimeout`'s `console.error` preserved verbatim.

- [x] Task 4: Build the structured-details Chat UI (AC: 1, 3, 5)
  - [x] Added a "Describe it" / "Quick details" mode toggle above the input row in `books.$bookId.chat.tsx`, matching `books.new.tsx`'s preset-button active-state convention. Structured mode renders four labeled inputs (Scene goal, Mood, POV/character, Setting) inside the same Chat route — no new route/screen.
  - [x] All four inputs and both submit paths share the same `isLoading` disable + `generationState.status === "loading"` no-op guard from Story 2.1's fix — no new double-submit path introduced.
  - [x] On failure, structured field values are preserved (only cleared on confirmed success, mirroring the free-text path).
  - [x] Payload: `{ bookId, mode: "structured", fields: structuredFields }` — all four fields sent as-is (empty strings included); the backend does the per-field trim/filter/validation.

- [x] Task 5: Tests (AC: 1, 2, 3, 4, 5)
  - [x] `composePrompt.test.ts`: +3 structured-mode tests (7 total) — only-supplied-fields rendering, mood directive assertion, all-four-fields-plus-shared-sections. All 4 original tests kept passing with updated call-site shape.
  - [x] `generate.test.ts`: 5 existing call sites updated to `{ mode: "free-text", description }`; +1 structured pass-through test (6 total).
  - [x] `generateScene.test.ts`: +3 structured-mode tests (13 total) — all-four-fields success + summarized message, single-field success, all-empty 400. All 10 original tests kept passing.
  - [x] `books.$bookId.chat.test.tsx`: +3 structured-mode tests (9 total) — mode toggle + all-empty block, single-field success + summarized bubble, failure preserves field values. All 6 original tests kept passing.

- [x] Task 6: Verify and deploy (AC: 1–5)
  - [x] `npm run verify` in `functions/` passed: lint, seam lint, build, 15 files / 102 tests.
  - [x] `bun run test` (9 files / 42 tests) and `bun run build` passed at repo root.
  - [ ] Push to `main` (`weave` remote) and confirm CI/CD deploy passes.
  - [ ] Live-verify with one writer account and clean up disposable data.

## Dev Notes

### Scope Boundaries

This story adds the second of three input modes (FR-3, structured-fields) onto the Generate pipeline Story 2.1 built. It does **not** implement: the draft-polish mode (Story 2.3), inline edit/regenerate/accept or scene persistence into `scenes` (Story 2.4), Style Engine UI changes (2.5), the usage indicator UI (2.6), or FR-11's full context assembly (Epic 3). The structured-fields prompt template is the only new prompt-construction logic in this story — the shared style/vision/threads/prior-scenes assembly in `composePrompt.ts` must not be duplicated, only reused by both branches.

### Architecture Compliance

- **AD-3**: assembled context stays the graceful-degradation set regardless of input mode — `assembleContext.ts` is untouched by this story; only `composePrompt.ts` needs a mode-aware branch.
- **AD-4**: `composePrompt` continues to read Book/Vision/Style/Threads live on every call (unchanged from Story 2.1) — this story's structured branch must follow the same rule, not cache anything mode-specific into the session doc beyond what Story 2.1 already persists (`priorScenesText`).
- **AD-9**: no change — both input modes call the same `generate` task (`gpt-5.6-terra` primary / `gemini-2.5-pro` fallback, per the swap made during Story 2.1's live verification). Do not add a second model-registry entry for structured mode; it is the same task, just a different prompt template.
- Seam rule (unchanged): `handlers/` never touches Firestore directly; `pipelines/` nodes never touch the HTTP response; all provider calls go through `services/gemini.ts`.
- FR-3 / single-chat-surface rule: the structured-details UI must live inside the existing Chat route, not a new route or screen.

### Current Code State To Preserve — Read Before Touching These Files

Story 2.1 shipped, then went through a code review that fixed several real bugs. This story's refactor of `composePrompt`/`generate`/`generateScene` MUST preserve every one of these, verified by re-reading the current file state (not the original Story 2.1 diff) before editing:

- `functions/src/pipelines/generate.ts`: `persistSessionNode` wraps its Firestore write in try/catch and returns `{}` (not a failure) on error — a session-persistence failure must never discard an already-generated, already-billed scene. `runGenerate`'s success check no longer requires `sessionId` to be truthy (`sessionId: result.sessionId ?? ""`). Both `composePromptNode` and `generateSceneNode` now `console.error` before returning `{status:"failed"}` — do not silently swallow errors again when you touch these functions to retype `description` → `input`.
- `functions/src/handlers/generateScene.ts`: `MAX_DESCRIPTION_LENGTH = 4_000` already exists — reuse it (or a sibling per-field constant) rather than inventing a new unrelated cap. The `appendChatMessage` calls (both the "user" turn and the "assistant_scene" turn — the user-turn persistence was itself a Story 2.1 code-review fix) are wrapped in try/catch that logs but still returns the generated scene to the client on a Firestore write failure — preserve this exactly when you add the structured-mode "user" message summary. `runGenerateWithTimeout`'s `.catch()` logs via `console.error` before resolving `{status:"failed"}`.
- `functions/src/services/books.ts`: `appendChatMessage` runs its last-order read and its write inside one Firestore transaction (`db.runTransaction`) — this closes a real concurrent-append race found in review. Do not revert to a plain read-then-write.
- `src/routes/books.$bookId.chat.tsx`: the textarea has `disabled={isLoading}`, and `submitDescription` no-ops if `generationState.status === "loading"` — both are Story 2.1 code-review fixes for a real double-submit bug. Apply the identical pattern to the new structured-mode inputs/submit path; do not ship a second submit path without the same guards.
- `functions/src/services/gemini.ts` and `functions/scripts/seedModelRegistry.mjs`: the `generate` task's primary model is `gpt-5.6-terra` (NOT `gpt-5.6-sol` — that was swapped during Story 2.1's live verification after `sol` blew a 25s timeout; `ARCHITECTURE-SPINE.md#AD-9` and this story's own AC4 already reflect the corrected model). This story does not touch model selection at all, but don't be confused by any stale references if you search the repo's git history.

### Data Shape

```ts
// New: shared by handler, pipeline state, and composePrompt
type SceneInput =
  | { mode: "free-text"; description: string }
  | {
      mode: "structured";
      fields: {
        sceneGoal?: string;
        mood?: string;
        povCharacter?: string;
        setting?: string;
      };
    };
```

No new Firestore fields or collections. The persisted "user" chat message for structured mode is still a plain `ChatMessage` with `type: "user"` — only its `text` is a computed summary string, not a JSON blob.

### Testing Notes

- Follow the existing test conventions exactly: `composePrompt.test.ts`/`generate.test.ts`/`generateScene.test.ts` mock dependencies via `vi.hoisted` + `vi.mock`, `books.$bookId.chat.test.tsx` mocks `authenticatedFetch` and `@tanstack/react-router`. Do not introduce a different mocking style for the new tests in the same files.
- For the "tense mood produces recognizably tense prose" AC, the unit-testable claim is that the composed prompt *contains a directive* tying tone to the mood value — actually verifying the LLM's output tone is a live-verification concern (Task 6), not something a unit test can assert.

### Previous Story Intelligence

- Story 2.1's code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) found and fixed 10 real issues in the exact files this story extends — see "Current Code State To Preserve" above for the specifics. Re-reading a file before editing it, not just trusting the original Story 2.1 story doc's task descriptions, is required here because the file state has moved past what that doc originally described.
- Story 2.1 also found that `runGenerateWithTimeout`'s 55s internal timeout and the `generate` task's model choice are coupled to real observed latency (frontier reasoning-tier models can blow the budget; the balanced tier does not, empirically, in one live test). This story doesn't change either, but if structured-mode prompts turn out meaningfully longer/shorter than free-text ones in practice, that's a live-verification observation worth a Debug Log note, not a reason to preemptively change the timeout.
- CI deploy is automatic on push to `main`, which tracks the `weave` remote, not `origin` — confirmed via `git branch -vv` during Story 2.1. Story 2.1 also hit a deploy failure once from a Hosting-rewrite/function-allowlist mismatch (`.github/workflows/firebase-deploy.yml`); this story adds no new Cloud Functions, so that specific failure mode is unlikely to recur, but the lesson (check the CI run, don't assume success) still applies.

### References

- `_bmad-output/planning-artifacts/epics.md#Story-2.2-Build-a-Scene-From-Quick-Details`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-3`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-4`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-9`
- `_bmad-output/implementation-artifacts/2-1-turn-a-scene-description-into-a-scene.md` (especially its Review Findings and Change Log sections)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-07-27: Created Story 2.2 context from Epic 2 backlog, building directly on Story 2.1's post-code-review file state (composePrompt/generate/generateScene/books.$bookId.chat.tsx), with explicit preservation notes for the 10 fixes from that story's review.

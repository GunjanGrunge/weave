---
baseline_commit: f7524f9fd486a4b86cf9978cd01834e10156dc78
---

# Story 2.4: Refine and Keep the Scene

Status: done

## Story

As a writer reviewing a generated scene,
I want to edit it inline, regenerate it, or accept it into my chapter,
so that I stay the author and nothing enters my manuscript without my approval.

## Acceptance Criteria

1. **Given** an unaccepted generated Scene is displayed in Book Chat, **when** I edit its prose inline, **then** the canonical candidate is autosaved without a separate Save action, survives reload, exposes Saving/Saved/Error feedback, and stale concurrent writes cannot overwrite a newer revision.
2. **Given** an active generation session, **when** I request Regenerate, **then** the server reuses the session's cached retrieval context when the manuscript revision is unchanged, reassembles it when stale, always rereads live Style/Vision/Threads at `composePrompt`, uses the original `SceneInput`, logs the model call through the existing provider service, and returns a retryable error without losing my current candidate on failure.
3. **Given** regeneration succeeds, **when** I review the candidate, **then** I can compare the current and immediately prior attempts side by side and revert once; comparison state and provenance survive reload and no full manuscript context reaches the browser.
4. **Given** I accept an active candidate, **when** acceptance commits, **then** the server appends exactly one Scene to the session's current Chapter with explicit numeric `order`, server-held text, `modelUsed`, `provider`, `sourceSessionId`, and a server timestamp; the linked chat card becomes read-only and repeat/double-click acceptance returns the same Scene rather than duplicating it.
5. **Given** autosave, regenerate, revert, or accept is in flight or fails, **when** I interact with the review card, **then** duplicate actions are blocked, local prose remains visible, stale responses from another book/session are ignored, and errors provide an explicit retry where the action is safely retryable.
6. **Given** the Book Chat is reloaded, **when** messages are fetched, **then** actionable assistant-scene messages include only their message/session identifiers, candidate revision, status, provenance, and optional prior attempt; legacy messages still render read-only, accepted messages remain locked, and sessions/assembled context are not client-readable.

## Tasks / Subtasks

- [x] Task 1: Define durable candidate and revision contracts (AC: 1, 3, 4, 6)
  - [x] Extend `Book` with legacy-safe `manuscriptRevision` semantics and initialize new Books at `0`.
  - [x] Extend `Chapter` with `nextSceneOrder`, initialized at `0`; Story 2.4 is the first writer of accepted Scenes, so existing chapters safely default to `0`.
  - [x] Add a `GenerationSession` type containing original `SceneInput`, retrieval-only `AssembledContext`, chapter id, manuscript revision, canonical candidate, current revision, provenance, optional previous attempt, message id, and active/accepted status.
  - [x] Extend assistant-scene chat messages with document id/session metadata while keeping all legacy message variants readable.
  - [x] Keep accepted `Scene` provenance explicit: `text`, `order`, `modelUsed`, `provider`, `sourceSessionId`, `createdAt`.

- [x] Task 2: Persist an actionable generated candidate without risking a successful model result (AC: 1, 4, 6)
  - [x] Add a bounded client idempotency key to initial generation. Claim it with a leased server-side attempt token before the model call; an in-progress replay returns a non-billable in-progress response, a completed replay returns the stored result, and an expired lease may be reclaimed without allowing the old token to commit late.
  - [x] Move generation-session/message persistence behind a service seam; pipeline nodes never write HTTP responses and handlers never access Firestore directly.
  - [x] Persist the original input, retrieval-only context, candidate/provenance, two ordered chat messages, and their association transactionally.
  - [x] Stop caching `composedPrompt`; Style/Vision/Threads are live inputs and must not be frozen into regeneration state.
  - [x] Return `messageId`, `sessionId`, candidate `revision`, provenance, and action availability from `/generateScene`.
  - [x] Fence the final persistence transaction by both attempt token and the manuscript revision captured during assembly; a timed-out/obsolete pipeline may never overwrite or append after its lease was replaced.
  - [x] Preserve the existing degraded-success rule: a generated, billed result is still returned if candidate/session persistence fails, but it is read-only and cannot be regenerated or accepted.

- [x] Task 3: Add authenticated optimistic autosave (AC: 1, 5, 6)
  - [x] Add `saveGeneratedScene` handler/service with `{bookId, sessionId, text, expectedRevision}` validation, ownership enforcement, non-empty bounded prose, and `409` stale/accepted conflicts.
  - [x] Update the session candidate and linked assistant message in one transaction; never identify a message by `order`.
  - [x] Return the canonical candidate and incremented revision. A `409` returns the current server candidate/revision so the UI can offer an explicit "Reload saved version" resolution without silently rebasing or overwriting another tab.
  - [x] Add handler/service tests for ownership, validation, legacy/missing sessions, stale revision, accepted lock, and successful persistence.

- [x] Task 4: Add cached-context regenerate and one-level revert (AC: 2, 3, 5)
  - [x] Add `regenerateScene` with a bounded idempotency key and leased attempt token. Duplicate/in-progress requests never trigger parallel billable calls; completed replays return the stored result.
  - [x] Implement `runRegenerate` in `pipelines/generate.ts`. The handler authenticates/validates and delegates; services own session reads, operation claims, and transactional commits.
  - [x] Load the server session and original `SceneInput`; if `book.manuscriptRevision` matches, skip assembly, otherwise run assembly and refresh the cached retrieval/chapter/revision.
  - [x] Re-enter at `composePrompt`, which must continue reading live Book Style, Vision, and Threads, then call the existing `generate` model task and usage logger.
  - [x] On success, atomically move the canonical candidate/provenance into `previousAttempt`, store the new candidate/provenance, increment revision, and update the linked message; commit only if the attempt token, expected candidate revision, and captured manuscript revision still match.
  - [x] On timeout/provider failure, preserve the current candidate. Do not immediately release a timed-out claim because inference is not cancelled; only the same token may finish, and reclaim occurs after lease expiry with late commits from the old token rejected.
  - [x] Add `revertGeneratedScene`; compare-and-set the revision, consume `previousAttempt`, and update session/message atomically without another model call.

- [x] Task 5: Accept exactly one ordered Scene (AC: 4, 5)
  - [x] Add `acceptScene` handler/service; accept only `bookId`, `sessionId`, and expected revision/idempotency metadata, never client-supplied prose, model, provider, chapter, order, or timestamps.
  - [x] In one transaction, read Book/session/chapter, check already-accepted replay before stale-revision rejection, allocate `chapter.nextSceneOrder`, preallocate and create one Firestore auto-ID Scene, store that id on the session/message, increment `book.manuscriptRevision`, and return the canonical Scene id/order.
  - [x] Treat replay/already-accepted requests as success with the original Scene id/order, including replays carrying the pre-accept revision.
  - [x] Do not call Muse, extraction, summarization, or any other downstream work synchronously; later Firestore triggers observe the Scene write.
  - [x] Test concurrent/replayed acceptance, ordering, ownership, stale revision, missing chapter, provenance, and accepted-card locking.

- [x] Task 6: Build the Scene Review card in the existing Book Chat (AC: 1-6)
  - [x] Replace actionable assistant-scene prose with an accessible autosizing textarea/editable region and compact icon/text toolbar for Accept, Regenerate, and Compare.
  - [x] Implement single-flight, coalesced autosave: edits during a request queue only the latest text, and the next save uses the returned revision. Debounce saves, display Saving/Saved/Error, and retain local prose on all failures.
  - [x] Flush and await pending autosave before regenerate/accept. Abort the requested action when save fails or conflicts; never regenerate or accept stale server text.
  - [x] On `409`, keep the local prose visible, block destructive actions, show the canonical server revision, and offer an explicit Reload saved version action; do not automatically overwrite either version.
  - [x] Show Compare only when `previousAttempt` exists; use the existing Dialog primitive for a responsive side-by-side current/prior comparison and provide Revert.
  - [x] Disable all conflicting actions while one is in flight; guard synchronous double clicks and ignore stale book/session responses.
  - [x] After acceptance, render the canonical text read-only with an Accepted status and no editing/regeneration controls.
  - [x] Keep legacy or persistence-degraded assistant messages read-only while preserving their generated prose.
  - [x] Add route tests for autosave/reload, stale saves, regenerate/retry, compare/revert, edited-text acceptance, double Accept, accepted reload, persistence-degraded output, narrow wrapping, and book navigation reset.

- [x] Task 7: Wire deployment and protect server-only session state (AC: 6)
  - [x] Export all new handlers, add Hosting rewrites, and add every function to the CI deployment allowlist.
  - [x] Use `allowedOrigins()` on every new/touched handler. Bind both `GOOGLE_API_KEY` and `OPENAI_API_KEY` to `regenerateScene`; non-model handlers bind no provider secrets.
  - [x] Runtime-validate all frontend responses, including candidate metadata, replay/in-progress results, and `409` canonical conflict payloads; do not rely on TypeScript assertions over network JSON.
  - [x] Replace `getMessages` hard-coded CORS with `allowedOrigins()`.
  - [x] Replace, rather than supplement, the broad nested Firestore allow rule. Authenticated owners may read intended manuscript data but cannot read sessions or directly write server-authoritative messages/scenes/sessions/usage, `Book.manuscriptRevision`, or `Chapter.nextSceneOrder`; Admin SDK handlers remain the mutation path.
  - [x] Add focused rules/static seam coverage available in this environment and document any emulator-only verification gap honestly.

- [x] Task 8: Verify end to end and update story records (AC: 1-6)
  - [x] Run focused red/green tests for every task, full frontend tests/build, Functions `npm run verify`, seam lint, and `git diff --check`.
  - [x] Smoke-test generation -> edit/autosave -> regenerate -> compare/revert -> accept -> reload using a real owned Book when authenticated deployment access is available; clean up test data.
  - [x] Update File List, completion notes, Change Log, and sprint status only after all checks pass.

### Review Findings

- [x] [Review][Patch] Fence a regeneration that outlives its HTTP timeout so it cannot replace the candidate after the API reports failure [functions/src/handlers/regenerateScene.ts:25]
- [x] [Review][Patch] Release or fail completed provider-error claims while retaining timeout leases, so immediate retries are actually retryable [functions/src/pipelines/generate.ts:143]
- [x] [Review][Patch] Bind initial-generation idempotency keys to an input snapshot or reset them when the writer changes input after an ambiguous failure [src/routes/books.$bookId.chat.tsx:205]
- [x] [Review][Patch] Persist and replay the completed regeneration result instead of returning whichever mutable candidate the session has later [functions/src/services/scenes.ts:299]
- [x] [Review][Patch] Use a request-generation token, not only `bookId`, to reject stale A -> B -> A generation responses [src/routes/books.$bookId.chat.tsx:221]
- [x] [Review][Patch] Project an explicit allowlist from message documents before returning `/getMessages` responses [functions/src/services/books.ts:371]
- [x] [Review][Patch] Deploy required Functions before Hosting and prevent cancellation from leaving production on a mixed frontend/backend version [.github/workflows/firebase-deploy.yml:11]
- [x] [Review][Patch] Add the claimed concurrency, accepted-lock, retry, degraded-output, route-reset, and responsive Scene Review coverage [functions/src/services/scenes.test.ts:1]

## Dev Notes

### Authoritative Design Decisions

- The editable candidate is durable server state in `books/{bookId}/sessions/{sessionId}` and its linked `messages/{messageId}` document. The browser receives only identifiers and candidate metadata, never `assembledContext`.
- `revision` is a candidate compare-and-set token. Every autosave, successful regenerate, and revert increments it. `expectedRevision` mismatch returns `409`.
- `book.manuscriptRevision` defaults to `0` for legacy Books and increments only when manuscript Scene state changes. Regenerate reuses cached retrieval only when this value matches the session.
- A regeneration keeps exactly one `previousAttempt`. Revert consumes it; this is Story 2.4's one-level comparison, not Epic 4 snapshot/version history.
- Accept preallocates a Firestore auto-ID inside the transaction and records it as `acceptedSceneId` on the session/message. Replay reads that stored id; explicit order comes from transactionally incrementing `chapter.nextSceneOrder`.
- Autosave uses a short debounce (target 500-750 ms) and visible state. Regenerate/Accept must flush or await pending autosave so the server-held canonical candidate is the writer's latest prose.
- `assembleContext` must return the `manuscriptRevision` captured with its reads. Session persistence and regeneration commits compare it to the current Book revision; if it changed, cached context cannot be stamped current. Prefer a read transaction or a bounded re-read/retry fence rather than unrelated non-atomic reads.
- Initial generation and regenerate use leased operation claims because handler timeout does not cancel inference. A claim has an idempotency key, opaque attempt token, expected candidate/manuscript revisions, lease expiry, and status/result. Only the current token may commit.
- The current app has one Chapter per Book. Accept uses the chapter captured by context assembly; Story 3.2 owns new-chapter/current-chapter UX. Do not add a chapter selector or `activeChapterId` in this story.

### Current Code To Extend

- `functions/src/pipelines/generate.ts` currently assembles context, composes, generates, then persists a session containing retrieval plus a stale composed prompt. Preserve degraded generated-result success, but replace persistence with the actionable session contract.
- `functions/src/handlers/generateScene.ts` currently appends two best-effort chat messages after generation. Consolidate candidate/session/message persistence; do not leave duplicate append paths.
- `functions/src/services/books.ts` already uses Firestore transactions for ordered chat appends. Reuse the transaction pattern; do not regress to read-then-write ordering.
- `src/routes/books.$bookId.chat.tsx` already preserves all three input modes, blocks duplicate generation, retains input on failure, cancels stale loads, and resets state on `bookId` changes. The review-card state must preserve those behaviors.
- `/getMessages` currently returns `{type,text,order}` only. Extend it with runtime-safe optional metadata and keep legacy records valid.
- `functions/src/types/scene.ts` already carries model/provider. The architecture spine is newer than stale Gemini-only wording elsewhere: current production is OpenAI primary with pinned Gemini fallback.

### Architecture Compliance

- Keep `handlers -> pipelines -> services`; all authentication and `book.uid === caller.uid` checks remain in handlers.
- All model calls continue through `services/gemini.ts` and the `generate` registry task so usage entries are written for regenerates.
- AD-4: sessions cache retrieval output only; every regenerate rereads live Style/Vision/Threads.
- AD-5: accept returns after its Firestore transaction. Muse/extraction are future event-triggered functions, never synchronous calls here.
- AD-6: `books/{bookId}/chapters/{chapterId}/scenes/{sceneId}`, explicit numeric ordering, server timestamps.
- AD-7: every endpoint verifies Firebase ID token and ownership; no client-supplied tenancy or provenance fields are trusted.
- AD-9: persist both provider and model for current/prior attempts and accepted Scenes.

### Libraries and Frameworks

- Use the installed React 19, TanStack Router, Firebase Functions/Admin SDK, LangGraph.js, Vitest, Testing Library, Tailwind, Radix Dialog, and Lucide stack. No new dependency is required.
- Do not replace the local Chat state machine with React Query as part of this story.
- Do not introduce client Firestore listeners for session state; mutations and canonical reads flow through authenticated handlers.

### File Structure

Expected new backend files:
- `functions/src/types/generationSession.ts`
- `functions/src/services/scenes.ts`
- `functions/src/handlers/saveGeneratedScene.ts`
- `functions/src/handlers/regenerateScene.ts`
- `functions/src/handlers/revertGeneratedScene.ts`
- `functions/src/handlers/acceptScene.ts`
- Corresponding `*.test.ts` files.

Expected updates:
- `functions/src/types/{book,chapter,chatMessage,scene}.ts`
- `functions/src/pipelines/generate.ts` and tests
- `functions/src/handlers/{generateScene,getMessages}.ts` and tests
- `functions/src/services/books.ts` and tests
- `functions/src/index.ts`
- `src/routes/books.$bookId.chat.tsx` and test
- `firebase.json`, `firestore.rules`, `.github/workflows/firebase-deploy.yml`

### Testing Requirements

- Test-first for each task; demonstrate the failing boundary before implementation.
- Service tests must exercise transaction/revision/order/idempotency behavior, not only mock handlers.
- Handler tests must prove authentication, ownership, validation, status codes, and that handlers delegate rather than touch Firestore.
- Pipeline tests must prove unchanged-revision regeneration skips assembly, changed revision reassembles, and live `composePrompt` still runs in both paths.
- Frontend tests must use accessible roles/labels, deferred promises for duplicate-action guards, fake timers for debounce, reload/rerender for durable state, and stale-response checks.
- Full gates: frontend tests/build; targeted frontend ESLint because repository-wide lint scans bundled `.adal` files; Functions `npm run verify`; `git diff --check`.

### Scope Boundaries

- No Style editing UI (Story 2.5), usage indicator (2.6), Muse/extraction/facts/embeddings/chapter summaries (Epic 3), snapshots (Epic 4), scene reordering, manuscript-wide diff, dedicated editor route, paragraph/chapter generation, or AI critique.
- Do not restore removed `/write`, `/chat`, `/refactor`, or mock-data routes.
- No current-chapter management beyond the session-captured Chapter; Story 3.2 owns chapter transitions.

### Previous Story and Git Intelligence

- Story 2.1 established the generation graph, server-side opaque session, provider fallback, usage logging, timeout/error UX, and the rule that a successful billed result survives chat/session persistence failure.
- Story 2.2 added structured input with strict per-field limits and synchronous duplicate-submit guards.
- Story 2.3 added polish input, preserved the pasted draft on failure, and kept all generation modes on one Chat surface.
- Story 2.3a replaced mock workspace data, hardened runtime payload validation, and confirmed route-state changes must ignore stale responses.
- Recent review commits repeatedly fixed non-transactional ordering, duplicate actions, malformed response handling, and stale cross-book state. Preserve those fixes from the current source, not older story diffs.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.4-Refine-and-Keep-the-Scene]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-9]
- [Source: _bmad-output/planning-artifacts/prds/prd-Story-2026-07-25/prd.md#FR-5]
- [Source: design-artifacts/E-Development/ui-epics.md#UI-Story-2.2-Scene-Review-Compare-Accept-Card]
- [Source: _bmad-output/implementation-artifacts/2-3-polish-my-own-draft.md]
- [Source: _bmad-output/implementation-artifacts/2-3a-replace-mock-workspace-with-real-writer-data.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-07-28: Implemented against baseline `f7524f9fd486a4b86cf9978cd01834e10156dc78`.
- 2026-07-28: Frontend verification passed: 18 files, 87 tests, production build.
- 2026-07-28: Functions verification passed: lint, seam lint, TypeScript build, 19 files, 146 tests.
- 2026-07-28: Firebase Hosting, Functions, and Firestore rules deployed successfully to `https://backupapp-bbf71.web.app`.
- 2026-07-28: Live smoke passed for `/login`, `/health`, and the unauthenticated boundary on all five generation/scene mutation endpoints.
- 2026-07-29: Code-review patches passed Functions verification (22 files / 177 tests) and frontend regression/build verification (20 files / 113 tests).
- 2026-07-29: GitHub Actions run `30389635376` deployed Firestore, all Function batches, then Hosting successfully; live `/login`, `/health`, and unauthenticated `/getMessages` smoke passed.

### Completion Notes List

- Added durable generation sessions with revisioned candidates, leased idempotency claims, transactional chat persistence, and manuscript revision fencing.
- Added authenticated autosave, regeneration, one-level compare/revert, and idempotent Scene acceptance with canonical server-side prose and ordered Scene allocation.
- Added the inline Scene Review card with coalesced autosave, explicit conflict recovery, stale-response guards, action locking, comparison, revert, and accepted read-only state.
- Added runtime validation for all scene API payloads while preserving legacy and persistence-degraded messages as read-only.
- Hardened Firestore rules so writers can read intended manuscript data but cannot read server-only sessions or directly mutate authoritative scene state.
- Hardened CI deployment to roll Functions in sequential quota-safe batches after one verified build, avoiding simultaneous Cloud Run revision CPU exhaustion.
- Deployed all new functions, Hosting rewrites, and Firestore rules. Live authenticated writer-flow verification was not run because no writer password is stored in this environment; service/handler/component coverage verifies the complete flow, and live endpoints verify the deployed authentication boundary.
- Firestore emulator execution remains unavailable because Java is not installed; focused static rules tests and the production rules compiler both passed.
- Closed all review findings: timeout fencing, provider-failure retry release, immutable regeneration replay, request/input identity guards, public message projection, compatible deploy ordering, and focused race/regression coverage.

### File List

- `.github/workflows/firebase-deploy.yml`
- `_bmad-output/implementation-artifacts/2-4-refine-and-keep-the-scene.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `firebase.json`
- `firestore.rules`
- `functions/src/handlers/acceptScene.ts`
- `functions/src/handlers/generateScene.test.ts`
- `functions/src/handlers/generateScene.ts`
- `functions/src/handlers/getMessages.ts`
- `functions/src/handlers/regenerateScene.ts`
- `functions/src/handlers/revertGeneratedScene.ts`
- `functions/src/handlers/saveGeneratedScene.ts`
- `functions/src/handlers/sceneMutation.ts`
- `functions/src/handlers/sceneMutations.test.ts`
- `functions/src/index.ts`
- `functions/src/pipelines/assembleContext.test.ts`
- `functions/src/pipelines/assembleContext.ts`
- `functions/src/pipelines/generate.test.ts`
- `functions/src/pipelines/generate.ts`
- `functions/src/services/books.ts`
- `functions/src/services/firestoreRules.test.ts`
- `functions/src/services/scenes.test.ts`
- `functions/src/services/scenes.ts`
- `functions/src/types/book.ts`
- `functions/src/types/chapter.ts`
- `functions/src/types/chatMessage.ts`
- `functions/src/types/generationSession.ts`
- `functions/src/types/scene.ts`
- `src/components/scene/SceneReviewCard.test.tsx`
- `src/components/scene/SceneReviewCard.tsx`
- `src/lib/scene-api.test.ts`
- `src/lib/scene-api.ts`
- `src/routes/books.$bookId.chat.test.tsx`
- `src/routes/books.$bookId.chat.tsx`

### Change Log

- 2026-07-28: Implemented Story 2.4 durable scene refinement and acceptance lifecycle; deployed to Firebase and moved the story to review.
- 2026-07-28: Batched CI Function rollouts after regional Cloud Run CPU quota rejected an all-at-once redeploy.
- 2026-07-29: Applied all code-review patches and moved Story 2.4 to done.

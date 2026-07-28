---
baseline_commit: 308bf6eb4a27099a0f74708268f1899b067c2994
---

# Story 2.6: See What My Writing Costs

Status: in-progress

## Story

As a writer using a paid API,
I want a simple running indicator of the calls made on my behalf,
so that I am never surprised by my usage volume.

## Acceptance Criteria

1. **Given** an owned Book is open in Chat, **when** its usage log loads, **then** a subtle provider-neutral indicator in the writing toolbar shows the Book's running successful-call count and combined input/output token total; zero usage is represented honestly.
2. **Given** a successful opening suggestion, Generation, regeneration, or future model task routed through the central model service, **when** its usage document is committed, **then** the indicator updates from the authoritative `books/{bookId}/usage` log without a page reload.
3. **Given** OpenAI serves a call or Gemini serves it as fallback, **when** the provider returns a billable response, **then** the central service attempts one usage entry containing the actual `task`, `provider`, `model`, non-negative `inputTokens`, non-negative `outputTokens`, and server timestamp; this includes a response later rejected by application-level output parsing.
4. **Given** both providers fail before returning a response, **when** the call ends, **then** no usage entry is created; **given** a usage-log write itself fails after a provider response, **then** the result remains usable and writing is not blocked, while the logging failure is reported server-side.
5. **Given** I navigate between Books, including A -> B -> A while an old listener can still deliver, **when** usage updates arrive, **then** only the active Book's summary is displayed and prior listeners are unsubscribed or rejected by request identity.
6. **Given** usage is loading, unavailable, malformed, or at any volume, **when** I keep writing, **then** message loading, Generation, regeneration, editing, and acceptance remain available; the indicator is informational only and never enforces a cap.
7. **Given** one writer attempts to read another writer's usage or write any usage document directly, **when** Firestore rules evaluate the request, **then** the read is denied unless the caller owns the parent Book and every client write remains denied.

## Tasks / Subtasks

- [x] Task 1: Preserve and verify the authoritative usage-log contract (AC: 2-4, 7)
  - [x] Add a backend `UsageTask`/entry contract with current tasks `openingSuggestion`, `generate`, and `regenerate`, designed to extend for future Muse/extraction/summarization tasks without UI changes.
  - [x] Keep one document per successful served model call under `books/{bookId}/usage/{usageId}` with `task`, actual `provider`, actual `model`, `inputTokens`, `outputTokens`, and `createdAt: serverTimestamp()`.
  - [x] Keep logging inside the central provider service immediately after a provider response and before application-level response parsing; handlers and pipelines must not write usage or maintain a separate counter.
  - [x] Pass explicit `generate` versus `regenerate` task identity into the shared scene model call. Idempotent replays that skip inference write nothing; a real retry that invokes a provider writes another auto-id entry.
  - [x] Make usage persistence best-effort: log a server error if Firestore recording fails, but return/parse the provider result normally so usage infrastructure never blocks writing.
  - [x] Count both OpenAI primary and Gemini fallback results. Do not use provider-specific indicator copy or hard-coded model ids.
  - [x] Retain the existing rule boundary: an authenticated owner may read usage; no client may create, edit, or delete it.
  - [x] Extend service/pipeline/rules regression coverage for primary/fallback logging, invalid-output logging, non-blocking log-write failure, distinct generate/regenerate tasks, no write when both providers fail, auto-id per-call durability, idempotent replay, owner-only reads, and write denial.

- [x] Task 2: Add a runtime-safe realtime usage subscription (AC: 1-3, 5-7)
  - [x] Add a focused frontend usage module that subscribes only to `books/{bookId}/usage` with the installed Firebase Web SDK and returns an unsubscribe function.
  - [x] Derive `{ callCount, inputTokens, outputTokens, totalTokens }` from the current snapshot; use the snapshot documents for calls and accept only finite non-negative token values when summing.
  - [x] Treat malformed token fields as zero for the display without mutating the log or crashing Chat. Do not expose per-call detail or raw usage documents in UI state.
  - [x] Surface listener failure through a callback/state that leaves all writing controls usable.
  - [x] Add unit tests for zero/multiple entries, combined input/output totals, malformed/negative values, subscription path, error delivery, and unsubscribe.

- [x] Task 3: Build the compact workspace Usage indicator (AC: 1, 5, 6)
  - [x] Add a provider-neutral `UsageIndicator` component using a familiar Lucide activity/usage icon and concise text such as `3 calls · 12.4k tokens`.
  - [x] Provide quiet loading and unavailable states. Use accessible status text and a tooltip/title where compact copy needs explanation.
  - [x] Reset on `bookId` changes, unsubscribe on change/unmount, and use a monotonically increasing request identity so stale A -> B -> A callbacks cannot overwrite current state.
  - [x] Keep the indicator compact and non-interactive; no usage sheet, settings route, dashboard, chart, task breakdown, pricing, forecast, alert, quota, or cap.
  - [x] Add component tests for loading, zero, live updates, formatting boundaries, unavailable state, unmount, normal route switch, A -> B -> A stale callbacks, and narrow layout.

- [x] Task 4: Integrate the indicator without regressing the writing loop (AC: 1, 2, 5, 6)
  - [x] Place the indicator in the Book Chat's lower writing toolbar beside, not over, the Input Mode controls; allow wrapping on narrow screens.
  - [x] Preserve message loading, the three Input Modes, generation idempotency/input retention, Style control, Scene Review autosave/regenerate/revert/accept, and route-reset behavior.
  - [x] Prove that a realtime snapshot update changes the displayed count after a successful generation-style usage write without requiring route reload or a second model/API call.
  - [x] Add route tests confirming the indicator receives the active `bookId`, does not alter `/getMessages` or `/generateScene` requests, and remains non-blocking when unavailable.

- [ ] Task 5: Verify security, build, deployment, and live behavior (AC: 1-7)
  - [x] Run focused red/green tests, the complete frontend suite/build, Functions `npm run verify`, seam lint, and `git diff --check`.
  - [x] Confirm no new dependency, endpoint, Hosting rewrite, Function export, provider secret, Firestore index, or direct client write was introduced.
  - [x] Deploy through the non-cancelling GitHub Firebase workflow, with Functions/Firestore completing before Hosting.
  - [ ] When writer credentials are available, open an owned Book, record the indicator, complete one successful generation, confirm exactly one new usage document with real provider/model/token values, and confirm the indicator increments without reload. Remove only generated test manuscript data; retain the legitimate usage audit entry.
  - [ ] Update the File List, completion notes, Change Log, story status, and sprint status only after verification succeeds.

## Dev Notes

### Authoritative Decisions

- The per-call log is the system of record. Do not add `usageCount` to a Book, a summary document, Cloud Function trigger, scheduled aggregation, or in-memory counter.
- The indicator is per Book, not global per writer. It reflects all successful calls recorded below that Book, including the opening suggestion created before the writer first enters Chat.
- Display both call volume and aggregate tokens to satisfy the epic's running-count language and UI Story 2.4's token-visibility requirement.
- The product is now multi-provider. `services/gemini.ts` is the legacy filename for the central OpenAI-primary/Gemini-fallback service; UI copy must say `calls`/`tokens`, not `Gemini usage`.
- Successful means the provider returned a valid result and the central service committed its usage entry. Failed provider attempts are not billing telemetry in V1 and do not create entries.
- Realtime observation is client read-only. Firestore rules already grant an authenticated owner reads at `books/{bookId}/usage/{usageId}` and deny all writes.

### Current Code To Extend

- `functions/src/services/gemini.ts` already records auto-id usage documents, but currently records after application parsing and lets a Firestore write failure reject an otherwise usable provider result. Move the one best-effort recording attempt to immediately after the raw provider response.
- `functions/src/pipelines/generate.ts` uses the same `generateScene` service call for generation and regeneration. Extend the call contract so new generation records `generate` and regeneration records `regenerate`; do not duplicate provider logic.
- `firestore.rules` already grants usage reads through `ownsBook(bookId)` and denies usage writes. Do not broaden the parent Book or wildcard rules.
- `src/lib/firebase.ts` initializes the shared Firebase app and Auth. Extend it with the Firestore client or consume `firebaseApp` from the usage module; never initialize a second app.
- `src/routes/books.$bookId.chat.tsx` owns the writing toolbar, three Input Modes, generation lifecycle, route identity, Style control, and Scene Review cards. Add one isolated indicator without coupling usage failure to Chat's `loadState` or `generationState`.
- `src/routes/books.$bookId.chat.test.tsx` mocks `StyleControl`; mock `UsageIndicator` similarly for route-integration assertions and keep detailed listener behavior in component/module tests.
- The UI design artifact asks for a bottom-toolbar pill. The current route has no separate bottom toolbar component; integrate into the existing Input Mode toolbar rather than inventing a new shell or page.

### Architecture Compliance

- AD-7 tenancy remains structural under `books/{bookId}`. Never use a collection-group/global usage query and filter it in the browser.
- AD-9 requires every future model task to route through the central service and append the same log shape. The indicator derives from documents, so future task names need no UI changes.
- Client SDK reads are governed by Firestore rules; server Admin SDK bypasses rules. This story uses the existing owner-read rule and adds no privileged endpoint.
- All usage writes remain server-generated. The client cannot supply or correct `task`, provider/model, token values, or timestamps.
- Keep React state local to the indicator. A usage listener error is degraded status only and must never throw through the route.

### Libraries And Latest Technical Notes

- Use the installed React 19, Firebase Web SDK, Vitest, Testing Library, Tailwind, and Lucide. Add no package.
- Firestore listeners deliver an initial snapshot and subsequent changes; return and call the listener's unsubscribe function on route change/unmount.
- Official Firestore aggregation queries can reduce reads for one-time summaries, but they are not the right primary mechanism for this UX's realtime update requirement. If real usage later becomes large, a product/architecture change can introduce a durable aggregate; do not pre-optimize V1.
- Firestore rules are not filters. The structurally scoped usage collection and parent ownership rule are required; never query all usage and expect rules to filter it.

### File Structure

Expected new files:
- `functions/src/types/usage.ts`
- `src/lib/usage.ts`
- `src/lib/usage.test.ts`
- `src/components/book/UsageIndicator.tsx`
- `src/components/book/UsageIndicator.test.tsx`

Expected updates:
- `functions/src/services/gemini.ts`
- `functions/src/services/gemini.test.ts`
- `functions/src/pipelines/generate.ts`
- `functions/src/pipelines/generate.test.ts`
- `src/lib/firebase.ts`
- `src/routes/books.$bookId.chat.tsx`
- `src/routes/books.$bookId.chat.test.tsx`
- `functions/src/services/firestoreRules.test.ts` only if existing owner-read/write-denial coverage is incomplete
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

No endpoint, Function export, Hosting rewrite, CI batch, or dependency is expected.

### Testing Requirements

- Follow red-green-refactor for subscription, component, and route integration.
- Mock Firestore at the module seam in component tests; do not make component tests depend on Firebase initialization.
- Use deferred/manual listener callbacks to prove realtime changes, unsubscribe, route changes, and A -> B -> A stale-callback rejection.
- Verify accessible status copy and formatting for `0`, singular `1 call`, plural calls, values below 1,000, and compact `k` totals.
- Keep existing backend usage-service tests and all Story 2.1-2.5 frontend workflows green.
- Firestore emulator execution still depends on Java. If unavailable, run the existing static rule seam tests and report the gap honestly.

### Scope Boundaries

- No currency, estimated dollar cost, price table, billing integration, budget, warning threshold, quota, hard cap, or generation blocking.
- No detailed usage dashboard, history table, chart, task/model/provider breakdown, date filter, export, reset, edit, or delete UI.
- No Epic 3 Muse, extraction, embedding, retrieval, or summarization implementation. Those future calls are counted automatically only when they use the central model service.
- No refactor/rename of `services/gemini.ts`, model registry changes, prompt changes, or provider-selection changes.

### Previous Story And Git Intelligence

- Story 2.5 established isolated, route-keyed Book controls, runtime network validation, non-blocking failure states, stale A -> B -> A protection, narrow layout tests, and the non-cancelling Functions-before-Hosting workflow.
- The Story 2.4/2.5 review fixed mutable replay, stale responses, promise ownership, private-field projection, and deploy ordering. Reuse request-generation identity and do not trust `bookId` equality alone.
- Current baseline `308bf6e` has 113 frontend and 177 backend tests green and is deployed through GitHub Actions run `30389635376`.
- Unrelated untracked root files (`index.html`, `scratch-ui-check.mjs`, `skills-lock.json`) must remain untouched and uncommitted.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.6-See-What-My-Writing-Costs]
- [Source: _bmad-output/planning-artifacts/prds/prd-Story-2026-07-25/prd.md#FR-8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-9]
- [Source: design-artifacts/E-Development/ui-epics.md#UI-Story-2.4-Running-Usage-Indicator]
- [Source: _bmad-output/implementation-artifacts/2-5-change-my-books-voice-at-any-time.md]
- [Source: https://firebase.google.com/docs/firestore/query-data/listen]
- [Source: https://firebase.google.com/docs/firestore/security/rules-query]
- [Source: https://firebase.google.com/docs/firestore/query-data/aggregation-queries]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Red tests confirmed regeneration task conflation and usage-write failures blocking valid prose.
- Repository-wide frontend lint remains blocked by pre-existing CRLF and `.adal` template errors; all story-touched frontend files pass ESLint directly.

### Completion Notes List

- Centralized usage recording now runs once immediately after a served provider response, normalizes token counts, distinguishes generation from regeneration, and cannot block usable output when Firestore logging fails.
- Added an owner-scoped Firestore listener that derives a provider-neutral per-Book call/token summary and safely ignores malformed token fields.
- Added a compact accessible Usage indicator to the wrapping Chat input-mode toolbar with loading, unavailable, realtime, route-reset, and stale A -> B -> A protection.
- Verification: frontend 22 files / 121 tests passed; production build passed; changed-file ESLint and `git diff --check` passed; Functions verify passed lint, seam lint, build, and 22 files / 180 tests.
- GitHub Actions run 30392825420 deployed Firestore, Functions, and Hosting successfully. Production `/login` and `/health` return 200, and the served bundle contains the new Usage indicator. Authenticated generation-to-indicator verification remains pending because no writer credentials are stored in this workspace.

### File List

- `_bmad-output/implementation-artifacts/2-6-see-what-my-writing-costs.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `functions/src/pipelines/generate.test.ts`
- `functions/src/pipelines/generate.ts`
- `functions/src/services/firestoreRules.test.ts`
- `functions/src/services/gemini.test.ts`
- `functions/src/services/gemini.ts`
- `functions/src/types/usage.ts`
- `src/components/book/UsageIndicator.test.tsx`
- `src/components/book/UsageIndicator.tsx`
- `src/lib/firebase.ts`
- `src/lib/usage.test.ts`
- `src/lib/usage.ts`
- `src/routes/books.$bookId.chat.test.tsx`
- `src/routes/books.$bookId.chat.tsx`

## Change Log

- 2026-07-29: Created comprehensive Story 2.6 context and marked ready-for-dev.
- 2026-07-29: Implemented authoritative best-effort usage logging and a realtime per-Book writing-cost indicator; local verification complete, deployment pending.
- 2026-07-29: Deployed commit `78b2292` successfully and verified production HTTP health/current Usage bundle; authenticated writer smoke test remains pending.

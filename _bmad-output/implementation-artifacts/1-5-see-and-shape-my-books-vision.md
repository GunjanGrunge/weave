---
baseline_commit: "ab4d684"
---

# Story 1.5: See and Shape My Book's Vision

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a writer,
I want to view and edit what the app knows about my intent - premise, characters, planted threads,
so that the book's memory of what I mean stays correct as my ideas evolve.

## Acceptance Criteria

1. **Given** my Book exists, **When** I open the Vision view, **Then** I see theme/genre, premise, character intents, the Structure Map (read-only), the Guidance Dial (visible, fixed to `normal` in V1, no selection control), and my Narrative Threads.
2. **Given** I edit theme/genre, premise, or character intents, **When** I save, **Then** the change persists via a field-scoped `update()` (never a document `set()`), per AD-10's ownership rule.
3. **Given** I add a Narrative Thread (surface detail, hidden meaning, subtlety register `invisible | subtle | explicit`, payoff intent), **When** I save it, edit it, or mark it paid off, **Then** the thread persists on the Vision Document with `status` and an empty `appearances` list - enforcement in prose arrives with Epic 3, but the registry is fully manageable now.

## Tasks / Subtasks

- [x] Task 0: Expand Vision/Thread domain types without breaking Story 1.3/1.4 (AC: 1, 2, 3)
  - [x] `functions/src/types/vision.ts` - replace `threads: []` with typed `NarrativeThread[]`; add `StructureBeat` shape for existing `structureMap`; keep `guidanceDial: "normal"` for V1.
  - [x] Thread fields: `id`, `surface`, `meaning`, `subtlety`, `payoffIntent`, `status`, `appearances`; `appearances` is an empty array on create in this story.
  - [x] Preserve Story 1.3 creation behavior: new Vision docs still seed `structureMap: []`, `guidanceDial: "normal"`, `threads: []`.

- [x] Task 1: Add backend Vision read/update services (AC: 1, 2, 3)
  - [x] Extend `functions/src/services/books.ts` with `getBookVisionForOwner(bookId, uid)` or equivalent service composition that verifies the Book exists and returns both Book ownership context and `books/{bookId}/vision/main`.
  - [x] Add `updateVisionDocument(bookId, patch)` that uses Firestore `update()` on `books/{bookId}/vision/main`, never `set()`, and only updates user-owned fields: `theme`, `premise`, `characterIntents`, `threads`.
  - [x] Do not update `structureMap` from any user handler; that remains Muse-owned per AD-10.
  - [x] Keep handlers thin: token verification and ownership check in `handlers/`, Firestore SDK calls in `services/` only.

- [x] Task 2: Add protected Vision HTTP handlers and Hosting rewrites (AC: 1, 2, 3)
  - [x] `functions/src/handlers/getVision.ts` - `onRequest`, verify ID token first, parse `bookId`, load Book, call `assertOwnership(decoded.uid, book.uid)`, return `{ book, vision }` or `{ code, message }`.
  - [x] `functions/src/handlers/updateVision.ts` - `onRequest`, verify ID token first, parse body, assert ownership, validate editable fields, apply field-scoped update, return the updated Vision document.
  - [x] Validation rules: string fields trim to bounded strings; character intents are a string array; thread subtlety must be one of `invisible`, `subtle`, `explicit`; thread status must be `open` or `paid_off`; server assigns IDs for new threads if the client does not provide one.
  - [x] Export both handlers from `functions/src/index.ts`.
  - [x] Add `/getVision` and `/updateVision` rewrites in `firebase.json`.
  - [x] Bind no AI secrets; this story does not call OpenAI/Gemini.

- [x] Task 3: Build the Vision view frontend (AC: 1, 2, 3)
  - [x] Add a TanStack route for `/books/$bookId/vision` (flat route file such as `src/routes/books.$bookId.vision.tsx`, matching current route conventions).
  - [x] Use `authenticatedFetch` for both backend calls. Do not use the client Firestore SDK.
  - [x] Render editable fields: theme/genre, premise, character intents.
  - [x] Render Structure Map as read-only empty/filled state; never provide edit controls for it.
  - [x] Render Guidance Dial as visible text fixed to `normal`; no selector or toggle in V1.
  - [x] Render Narrative Threads with add/edit/mark-paid-off flows; preserve existing thread IDs; new thread starts with `status: "open"` and `appearances: []`.
  - [x] The route must show clear loading, not-found/unauthorized/error, dirty, saving, and saved states.

- [x] Task 4: Tests (AC: 1, 2, 3)
  - [x] Backend service tests prove Vision update uses `update()` and never `set()`.
  - [x] Handler tests cover: valid owner read, valid owner update, missing/invalid token 401, nonexistent book 404, cross-owner rejection, malformed thread/subtlety/status 400, and that `structureMap` cannot be changed through the user update handler.
  - [x] Frontend tests cover: initial Vision render, save of theme/premise/intents, Structure Map read-only behavior, Guidance Dial has no control, add/edit/paid-off thread flow, and no direct Firestore import/use.

- [x] Task 5: Verify and deploy (AC: 1, 2, 3)
  - [x] Run `npm run verify` in `functions/`.
  - [x] Run `bun run test` and `bun run build` at repo root.
  - [x] Push to `main` so `.github/workflows/firebase-deploy.yml` deploys automatically.
  - [x] Live verify with one writer account: create/open an existing Book, load Vision, edit premise/intents, add/edit/pay off a thread, confirm Firestore `vision/main` changed only user-owned fields and retained `structureMap`.
  - [x] Clean up any test data created for live verification.

## Dev Notes

### Scope Boundaries

This story is the Vision management surface only. It does not implement scene generation, Muse beat detection, thread enforcement in prose, fact extraction, embeddings, snapshots, export, or the per-book writing Chat. Epic 3 will make `structureMap` and `threads.appearances` active in generation; this story only lets the writer maintain the author-truth registry.

### Architecture Compliance

- AD-7: every handler verifies the Firebase ID token before reading or writing, then applies the single `assertOwnership(callerUid, book.uid)` choke-point.
- AD-10: user handlers own premise/theme/character-intent/thread edits; the Muse owns `structureMap`. Use field-scoped `update()` merges, not document-level `set()`.
- AD-11: threads are author-truth and stay separate from extracted facts. Do not write thread contents to `facts`.
- Existing seam rule: `handlers/` may call services, but handlers must not import Firestore directly; `services/` owns Firestore access.
- Secrets: this story has no model call and must not bind `GOOGLE_API_KEY` or `OPENAI_API_KEY`.

### Current Code State To Preserve

- `functions/src/services/books.ts` already creates Book/Chapter/Vision/messages atomically in `createBookWithIntake`.
- `functions/src/services/books.ts#getVisionDocument` is used by the Story 1.4 intake opening-suggestion pipeline. Do not break that signature unless you update its tests and call sites.
- `functions/src/handlers/retryOpeningSuggestion.ts` now has a timeout guard matching create; preserve that behavior.
- `functions/src/services/gemini.ts` writes opening-suggestion usage to a deterministic `usage/openingSuggestion` doc to avoid timeout/retry duplicates. This story should not touch AI usage logging.
- `src/routes/books.tsx` still renders an empty mock shelf. Do not make a broad real shelf replacement in this story unless needed only to link to the Vision route during manual testing.
- `src/routes/books.new.tsx` currently navigates to `/books` after intake. Avoid changing the completed intake flow unless you add a small link to the new Vision route that tests cover.

### Data Shape

Recommended thread shape:

```ts
type ThreadSubtlety = "invisible" | "subtle" | "explicit";
type ThreadStatus = "open" | "paid_off";

type NarrativeThread = {
  id: string;
  surface: string;
  meaning: string;
  subtlety: ThreadSubtlety;
  payoffIntent: string;
  status: ThreadStatus;
  appearances: string[];
};
```

Keep `appearances` empty on create. Future Epic 3 scene-accept/Muse/extraction work will append appearances; do not prebuild that.

### Frontend UX Guidance

The Vision view is an operational editor, not a marketing page. Use dense, calm panels with clear labels and predictable save controls. Structure Map and Guidance Dial should look intentionally read-only, not disabled due to a loading bug. Thread controls should make the paid-off status clear and reversible only if the handler explicitly allows editing status back to `open`.

### Testing Notes

- Use the existing frontend test style in `src/routes/books.new.test.tsx`.
- Use the existing handler test style in `functions/src/handlers/createBook.test.ts` and `retryOpeningSuggestion.test.ts`.
- Firestore Rules unit tests remain deferred because this environment has no confirmed Java/emulator path. Do not mark rules tests complete unless they actually run.

### Previous Story Intelligence

- Story 1.4 review found the timeout/retry race risk. It is patched by timeout-bounding retry and making opening-suggestion usage idempotent. Do not reintroduce unbounded post-click waits.
- Story 1.4 intentionally switched text model registry entries to OpenAI primary with Gemini fallback while keeping embeddings Gemini-only. Story 1.5 does not need model access.
- CI deploy is automatic on push to `main`; do not run ad hoc broad deploy commands unless the workflow fails.

### References

- `_bmad-output/planning-artifacts/epics.md#Story-1.5-See-and-Shape-My-Books-Vision`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-7`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-10`
- `_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-11`
- `_bmad-output/implementation-artifacts/1-4-receive-opening-suggestions-from-the-muse.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Created from sprint backlog key `1-5-see-and-shape-my-books-vision` after Epic 1 review.
- `functions/`: `npm run verify` passed (lint, seam lint, build, 10 files / 56 tests).
- Repo root: `bun run test` passed (8 files / 33 tests).
- Repo root: `bun run build` passed; Vite emitted the existing chunk-size warning for the SPA bundle.
- GitHub Actions deploy run `30242687945` passed and deployed commit `ca8712a`.
- Live authenticated verification used a temporary custom-token UID and disposable Book `story-1-5-live-1785133740498`; `/getVision` returned 200, `/updateVision` returned 200, `structureMap` and `guidanceDial` were retained despite client-supplied overwrite attempts, and the paid-off thread persisted with an ID. Test docs were deleted immediately after verification.

### Completion Notes List

- Story context created with backend handler/service, frontend route, testing, and deployment guardrails.
- Expanded Vision typing for narrative threads and structure beats while preserving Story 1.3's seeded empty arrays and fixed guidance dial.
- Added protected `getVision` and `updateVision` callable-over-Hosting endpoints with token verification, ownership assertion, server-side field validation, and field-scoped Vision `update()`.
- Added a `/books/$bookId/vision` route that uses `authenticatedFetch`, provides editable author-owned Vision fields, and keeps Structure Map and Guidance Dial read-only in V1.
- Added backend service/handler coverage and frontend route coverage for render, save, thread editing, read-only Structure Map, fixed Guidance Dial, and no client Firestore import.
- Pushed and verified the deployed protected endpoints against Firebase Hosting rewrites.

### File List

- `_bmad-output/implementation-artifacts/1-5-see-and-shape-my-books-vision.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `.github/workflows/firebase-deploy.yml`
- `firebase.json`
- `functions/src/handlers/getVision.test.ts`
- `functions/src/handlers/getVision.ts`
- `functions/src/handlers/updateVision.test.ts`
- `functions/src/handlers/updateVision.ts`
- `functions/src/index.ts`
- `functions/src/services/books.test.ts`
- `functions/src/services/books.ts`
- `functions/src/types/vision.ts`
- `src/routes/books.$bookId.vision.test.tsx`
- `src/routes/books.$bookId.vision.tsx`

### Review Findings

- [x] [Review][Patch] `updateVisionDocument` throws a 500 instead of a clean 404 when the Vision doc is missing [functions/src/services/books.ts `updateVisionDocument`] — Firestore's real `.update()` rejects with `NOT_FOUND` on a nonexistent doc, which isn't caught by `buildUpdateVisionResponse`'s `AuthError`/`ValidationError`-only catch, so it falls through to the generic 500 handler; the `if (!vision) return 404` code after the `.update()` call is unreachable dead code. Fix: check existence before calling `.update()` and return `undefined` (mapped to 404) if missing, matching `getVision`'s behavior for the identical condition.
- [x] [Review][Patch] Ownership check happens after body validation in `updateVision.ts`, reversing the order Task 2 specifies ("verify ID token first, parse body, assert ownership, validate...") and AD-7's intent that ownership gates access before further processing — confirmed by `updateVision.test.ts`'s malformed-thread test asserting `getBookMock` was never called. Fix: load the book and assert ownership before validating the request body.
- [x] [Review][Patch] No uniqueness check on client-supplied narrative thread IDs [functions/src/handlers/updateVision.ts `parseThread`/`parseVisionPatch`] — duplicate IDs in the same `threads[]` payload are persisted as-is, breaking the frontend's `key={thread.id}` React keys and any future Epic-3 logic keyed on thread identity.
- [x] [Review][Patch] Blank/whitespace-only threads can be saved, and there is no way to delete a thread [functions/src/handlers/updateVision.ts `parseThread`; src/routes/books.$bookId.vision.tsx] — `cleanString` accepts an empty post-trim string for `surface`/`meaning`/`payoffIntent`, and the UI has an "Add Thread" button but no remove control, so a misclick permanently persists an empty thread with no way to undo it in-app.
- [x] [Review][Patch] `appearances` is freely client-writable despite being a system-owned field per AC-3/Dev Notes ("keep appearances empty on create... future Epic 3 work will append appearances; do not prebuild that") [functions/src/handlers/updateVision.ts `parseThread`] — any caller of `/updateVision` can inject arbitrary `appearances` entries today, with only frontend convention (never sending them) as the actual guard. Fix: server should always derive `appearances` from the existing stored thread (matched by id), ignoring whatever the client sends, defaulting to `[]` for genuinely new threads.
- [x] [Review][Patch] All non-ok Vision-load responses (401/404/500) collapse into one generic "Vision unavailable" message [src/routes/books.$bookId.vision.tsx `loadVision`] — Task 3 explicitly requires distinguishable "not-found/unauthorized/error" states; currently every failure shows the same copy regardless of cause.
- [x] [Review][Patch] Embedded newline in a character intent can silently corrupt on the next save round-trip [functions/src/handlers/updateVision.ts `cleanString`/`parseCharacterIntents`; src/routes/books.$bookId.vision.tsx] — the frontend round-trips intents via `join("\n")`/`split("\n")`; the server never rejects/strips embedded `\n` within a single intent value, so a value written by a non-UI caller with an internal newline gets silently split into two entries the next time the UI saves.
- [x] [Review][Patch] `getVision.ts` and `updateVision.ts` both hardcode `cors: ["https://backupapp-bbf71.web.app"]` — these are new files in this story that predate the shared `functions/src/config/cors.ts` helper (added in Story 1.3's review); should use `allowedOrigins()` like `createBook.ts`/`whoami.ts`/`retryOpeningSuggestion.ts` now do.
- [x] [Review][Defer] Last-write-wins full replace of theme/premise/characterIntents/threads with no concurrency guard [functions/src/services/books.ts `updateVisionDocument`; src/routes/books.$bookId.vision.tsx `saveVision`] — a stale second tab/device can silently revert changes made by a first save. Deferred: low likelihood for a single owner editing their own private book; a real fix needs either optimistic-concurrency versioning or per-field partial updates, disproportionate effort at 3-user scale right now.
- [x] [Review][Defer] Inconsistent 401 vs 404 lets an authenticated caller distinguish "book doesn't exist" from "book exists but isn't mine" by probing `bookId` values against `/getVision`/`/updateVision` [functions/src/handlers/getVision.ts, updateVision.ts]. Deferred: low severity for 3 trusted private accounts; revisit if the user base ever grows beyond mutually-trusted accounts.
- [x] [Review][Defer] `slice()` truncation of `theme`/thread text at `MAX_SHORT_TEXT`/`MAX_LONG_TEXT` can split a UTF-16 surrogate pair, corrupting a boundary character (e.g. an emoji) [functions/src/handlers/updateVision.ts `cleanString`]. Deferred: cosmetic, extremely low likelihood.
- [x] [Review][Defer] `getVision`/`updateVision` don't restrict HTTP method (a GET is processed identically to POST, just fails body validation incidentally) — deferred, matches the pre-existing pattern across every other handler in the codebase; not a regression introduced by this story.

## Change Log

- 2026-07-27: Created Story 1.5 context from Epic 1 backlog.
- 2026-07-27: Implemented protected Vision read/update backend, Vision editor frontend, CI deploy target updates, and local test/build verification.
- 2026-07-27: Deployed via GitHub Actions, live-verified authenticated Vision read/update behavior, cleaned up test docs, and moved Story 1.5 to review.
- 2026-07-27: Code review applied 8 patches — fixed `updateVisionDocument` 500-instead-of-404 on a missing Vision doc; reordered ownership check before body validation in `updateVision.ts`; rejected duplicate thread IDs and blank required thread fields; added a thread Remove control; made `appearances` server-derived (ignoring client input) instead of client-writable; distinguished 401/404/error states on the Vision-load screen; stripped embedded newlines from character intents; fixed hardcoded CORS in `getVision.ts`/`updateVision.ts` to use `allowedOrigins()`. 4 low-severity items deferred. All functions (124) and frontend (49) tests pass; `functions verify` and root `bun run build` both green.

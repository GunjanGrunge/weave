# Deferred Work Ledger

## Deferred from: code review of 1-2-sign-in-as-one-of-three-private-accounts (2026-07-26)

- Post-sign-in navigation always goes to `/`, discarding the originally-requested deep link when `RouteGuard` bounces an unauthenticated visit to a protected route [src/routes/login.tsx, src/lib/route-guard.tsx]. Deferred: pre-existing scope choice — AC-1 only requires reaching the workspace, not preserving the original destination.
- No schema/type validation in Firestore rules' `create`/subcollection rules (e.g. `uid` isn't checked to be a string) [firestore.rules]. Deferred: self-inflicted data-quality concern relevant once Story 1.3+ introduces real document schemas; no cross-tenant exposure today.
- `UserMenu.handleSignOut` has no error handling for a rejected `signOut()` call [src/components/layout/UserMenu.tsx]. Deferred: low-severity nit, no user-facing failure mode observed.
- `src/lib/api.ts`'s `resolveEndpoint`/`authenticatedFetch` don't handle absolute URLs, don't merge `Headers`/array-form `init.headers`, and don't force-refresh the ID token. Deferred: none of these are exercised by any current call site (only ever called with a relative path and no custom headers); worth revisiting once Story 1.3+ adds more authenticated endpoints.
- Double-submit race in `LoginForm` — no synchronous guard against rapid repeated Enter presses before `disabled` reflects [src/routes/login.tsx]. Deferred: cosmetic edge case.
- No Firestore Rules unit tests exist despite rules being the sole tenant-isolation enforcement point (would have caught the `uid`-reassignment patch item) [firestore.rules]. Deferred: no Java/Firestore emulator available in this environment; needs `@firebase/rules-unit-testing` coverage from an environment that has it.

## Deferred from: code review of 2-1-turn-a-scene-description-into-a-scene (2026-07-27)

- Unbounded prompt growth from concatenating all prior scenes in the active chapter verbatim, no per-chapter cap [functions/src/pipelines/composePrompt.ts]. Deferred: belongs to Epic 3's chapter-summarization work (AD-3), which is the designed mechanism for capping context growth; not something 2.1 should solve standalone.
- `getMessages` has no pagination, fetching the entire message history on every Chat page load [functions/src/services/books.ts:207-216]. Deferred: acceptable at 3-user V1 scale, no spec requirement; revisit if chat histories grow large.
- Narrative Thread `subtlety`/`status` holding an unrecognized enum value silently degrades the prompt (renders "Rule: undefined" or drops the thread) [functions/src/pipelines/composePrompt.ts]. Deferred: only reachable via malformed data — the Story 1.5 Vision-update validation path already enforces the enum values on write.
- Non-ok HTTP responses (401/404/502) are handled identically on the frontend with no differentiated reauth/not-found UX [src/routes/books.$bookId.chat.tsx]. Deferred: matches the exact pattern already used in `books.new.tsx`/`books.$bookId.vision.tsx` from Stories 1.3/1.5; a cross-cutting improvement, not a 2.1-specific regression.
- NFR-4's ~15s response target is not empirically measured for the shipped `gpt-5.6-terra` model — only confirmed to complete within a 55s window once during live verification. Deferred: needs a dedicated latency-measurement pass (multiple timed live calls), not a code change.
- `persistSessionNode` writes `chapterId: null` when a book has zero chapters [functions/src/pipelines/generate.ts:60-80]. Deferred: currently unreachable — `createBookWithIntake` always creates exactly one chapter atomically with the book; only a future feature or manual data tampering could hit this path.
- `functions/src/pipelines/generate.ts` defines its own local `firestore()`/`initializeApp()` helper instead of centralizing Firestore access in `services/` [functions/src/pipelines/generate.ts:10-15]. Deferred: matches the existing precedent already set by `services/gemini.ts` before this story (Story 1.4); a cross-cutting refactor to consolidate all three copies is a separate cleanup task, not new debt from 2.1.

## Deferred from: code review of 2-2-build-a-scene-from-quick-details (2026-07-27)

- Structured field values aren't newline-sanitized before being embedded as `Label: value` prompt lines, letting a value like `"tense\nSetting: ..."` fabricate an extra prompt line [functions/src/pipelines/composePrompt.ts:63-83]. Deferred: same injection class the free-text mode already fully permits (arbitrary unsanitized text goes straight into the prompt); no downstream code treats the `Label:` boundary as structured/authoritative, so this isn't a new distinct vulnerability class — a general prompt-injection mitigation pass would need to cover both modes together.
- `composePrompt`/`runGenerate` would accept a structured `SceneInput` with an empty `fields` object if called directly, bypassing the handler's non-empty-field validation [functions/src/pipelines/composePrompt.ts; functions/src/pipelines/generate.ts]. Deferred: unreachable today — only the handler constructs `SceneInput`, and it always validates at least one non-empty field first; this is defense-in-depth for a hypothetical future direct caller, not a live gap.

## Deferred from: code review of 1-3-start-a-book-through-a-guided-conversation (2026-07-27)

- Style preset list duplicated verbatim between `functions/src/config/stylePresets.ts` and `src/lib/style-presets.ts` with no shared source of truth and no drift-detection test. Deferred: pre-existing tradeoff explicitly flagged in Task 2's own notes ("Dev Notes on duplication") and PRD Open Question 1 remains unresolved by the PM.
- No length limit on user-supplied intake text (`whatToWrite`, `mainCharacter`, `roughPremise`, `customInstruction`) [functions/src/handlers/createBook.ts:27]. Deferred: low likelihood given the app is restricted to three private, trusted accounts (Story 1.2 scope); a large-enough payload could still hit Firestore's ~1MiB document limit.
- Task 4's Firestore Rules unit test checkbox is marked done but was never written (`java` unavailable in this environment) [firestore.rules:225]. Deferred: matches the accepted precedent set by Story 1.2's identical deferral; wildcard rule coverage was verified manually instead.
- `RouteGuard`'s public-path (`/login`) exemption is enforced only by a comment in `__root.tsx`'s routing, with no runtime check or test tying the invariant together [src/lib/route-guard.tsx]. Deferred: no current failure; flagged as a future-regression risk if another public route is added.

## Deferred from: code review of 1-4-receive-opening-suggestions-from-the-muse (2026-07-27)

- Model registry is cached for the lifetime of a warm Cloud Functions instance — an operator fixing a broken/renamed model in `config/geminiModels` has no effect on already-warm instances until they cycle [functions/src/services/gemini.ts]. Deferred: acceptable at 3-user scale; a cache-bust mechanism is disproportionate effort right now.
- No rate limiting/cooldown on `retryOpeningSuggestion` beyond the already-succeeded guard added in this review [functions/src/handlers/retryOpeningSuggestion.ts]. Deferred: low risk for 3 trusted private accounts; revisit if abuse or cost becomes a real concern.
- Overly broad catch blocks in `generateOpeningSuggestions` treat any exception (including a bug in response parsing) identically to a provider outage, masking future parsing bugs as fallback triggers [functions/src/services/gemini.ts]. Deferred: speculative future-bug risk, not a live defect.
- Empty-string `text`/`rationale` pass `parseOpenings`'s schema validation and would render as blank suggestion entries [functions/src/services/gemini.ts]. Deferred: low likelihood, no live occurrence observed.
- Unknown/typo'd `provider` value in the model registry silently falls through to the Gemini branch instead of raising a configuration error [functions/src/services/gemini.ts `callConfiguredModel`]. Deferred: registry is admin-seeded trusted data, not user input.
- Missing `usageMetadata`/`usage` block (not just missing sub-fields) is silently logged as zero cost [functions/src/services/gemini.ts]. Deferred: cosmetic accuracy of usage log, not correctness-critical at current scale.
- `book.uid` read from Firestore with no validation before `assertOwnership` — a corrupted/legacy doc missing `uid` would produce an opaque 500 instead of a controlled 401/404 [functions/src/handlers/retryOpeningSuggestion.ts]. Deferred: matches the same class of gap already accepted in Story 1.2's deferred-work entry on missing Firestore-rules schema validation.
- AC-1/Task 2 spec text still describes generation "via `@google/genai`/`GoogleGenAI`" but the shipped primary path is a raw `fetch` to OpenAI's Responses API. Deferred as documentation drift, not a code defect — the seam rule (all LLM calls go through `services/gemini.ts`) is still honored.

## Deferred from: code review of 1-5-see-and-shape-my-books-vision (2026-07-27)

- Last-write-wins full replace of theme/premise/characterIntents/threads with no concurrency guard [functions/src/services/books.ts `updateVisionDocument`; src/routes/books.$bookId.vision.tsx `saveVision`] — a stale second tab/device can silently revert changes made by a first save. Deferred: low likelihood for a single owner editing their own private book; a real fix needs either optimistic-concurrency versioning or per-field partial updates, disproportionate effort at 3-user scale right now.
- Inconsistent 401 vs 404 lets an authenticated caller distinguish "book doesn't exist" from "book exists but isn't mine" by probing `bookId` values against `/getVision`/`/updateVision` [functions/src/handlers/getVision.ts, updateVision.ts]. Deferred: low severity for 3 trusted private accounts; revisit if the user base ever grows beyond mutually-trusted accounts.
- `slice()` truncation of `theme`/thread text at `MAX_SHORT_TEXT`/`MAX_LONG_TEXT` can split a UTF-16 surrogate pair, corrupting a boundary character (e.g. an emoji) [functions/src/handlers/updateVision.ts `cleanString`]. Deferred: cosmetic, extremely low likelihood.
- `getVision`/`updateVision` don't restrict HTTP method (a GET is processed identically to POST, just fails body validation incidentally). Deferred: matches the pre-existing pattern across every other handler in the codebase; not a regression introduced by this story.

## Deferred from: code review of 2-3-polish-my-own-draft (2026-07-27)

- **Resolved by Story 2.3a (2026-07-28):** Real books and the functional Book Chat were disconnected from the visible shelf and `/write` studio. The new ownership-scoped `listBooks` endpoint now powers the dashboard and shelf, cards open `/books/{bookId}/chat`, and the mock `/write` route/catalog were removed.
- Assembled prompts can grow without a total context budget as accepted scenes accumulate [functions/src/pipelines/assembleContext.ts:16, functions/src/pipelines/composePrompt.ts:56]. This predates Story 2.3 and is already represented by the Story 2.1 deferred item for unbounded prior-scene context; retained here because the 8,000-character draft mode adds to the same model-latency risk.

## Epics 3-4 and book deletion review (2026-07-29)

Resolved in the review remediation:

- Chapter creation now uses a client idempotency key and one contended Firestore transaction.
- Background summaries, entity extraction, and Muse notes use durable automation claims and deterministic output IDs.
- Fact merges use optimistic version checks and collision-resistant entity IDs.
- Context revision is checked after all reads, embedding usage is recorded, and Muse notes refresh in Chat.
- Snapshots publish atomically against a watched manuscript revision.
- Restore is bounded and atomic, restores coherent message/session state, and suppresses restore-generated triggers.
- Snapshot, compare, restore, export, Vision navigation, and deletion controls are wired into the authenticated UI.
- Restore/delete confirmation is strict, exports require signed URLs, and large operations are bounded.
- Recursive book deletion covers unknown nested state, intake requests, and Storage exports.
- Function deployment coverage, Hosting rewrites, the vector index, and the frontend assertion were repaired.

Still open:

- [Story 4.5] Provision and verify PITR, scheduled managed exports, retention, and a restore drill before moving the story out of backlog.

## Story Bible follow-up work (2026-07-31)

- source_spec: none
  summary: Add a conversational co-author mode for brainstorming, editorial pushback, and an explicit transition from discussion to scene drafting.
  evidence: Split from Story Bible memory because conversational intent routing and dialogue UX are independently shippable after canonical memory exists.
- source_spec: none
  summary: Build a split writing workspace with Chat and a live manuscript preview side by side.
  evidence: Split from Story Bible memory because workspace composition is an independent frontend deliverable that can consume the memory APIs later.
- source_spec: none
  summary: Add revision intelligence with manuscript diff detection, intentional-wording controls, proposed corrections, and selective acceptance.
  evidence: Split from Story Bible memory because edit review and merge semantics require a separate versioned workflow even though accepted edits will update memory.
- source_spec: none
  summary: Add a proactive Muse guidance surface for pacing, tension, continuity, title, and next-scene suggestions.
  evidence: Split from Story Bible memory because advisory generation and its dedicated UI are independently shippable once canonical context is available.
- source_spec: `_bmad-output/implementation-artifacts/spec-story-bible-memory.md`
  summary: Stop exposing semantic fact embedding vectors through direct owner Firestore reads.
  evidence: Existing `facts` documents combine user-visible fact data with raw embeddings, and Firestore rules cannot project fields from readable documents.

Release verification completed on 2026-07-29:

- Firestore rules and the 768-dimensional vector index were deployed.
- All HTTP functions and the three Firestore triggers were deployed; triggers are colocated with Firestore in `asia-south1`.
- Hosting was released with all 22 API rewrites.
- Authenticated production checks covered sign-in, shelf data, Book Chat, Vision navigation, scene controls, snapshot listing, export actions, and typed deletion confirmation with no browser console or request failures.

## Deferred from: code review of 2-6-see-what-my-writing-costs (2026-07-29)

- The frontend subscribes directly to `books/{bookId}/usage` using `onSnapshot` and reduces all usage records in memory. For books with a very high number of generations, this will retrieve and process a large array of documents, causing network and client-side processing overhead. [src/lib/usage.ts:40-54] — deferred, design choice (pre-optimization avoided in V1).

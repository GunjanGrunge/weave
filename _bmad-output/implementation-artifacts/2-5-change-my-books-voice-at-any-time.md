---
baseline_commit: f9d34e52c98ae0a96398ae9ea4d1982eccf71d47
---

# Story 2.5: Change My Book's Voice at Any Time

Status: done

## Story

As a writer whose book evolves,
I want to pick, blend, or write the style my book generates in and change it mid-book,
so that a style shift is a decision, not a re-setup.

## Acceptance Criteria

1. **Given** an owned Book is open in Chat, **when** I open the integrated Style control, **then** I see the server-supplied curated presets, the Book's canonical active selection, optional Custom Instruction, and a revision; no separate settings route or duplicated client catalog is used.
2. **Given** I select one preset, select two presets in a defined order, use Custom Instruction alone, or combine presets with Custom Instruction, **when** the change is committed, **then** the Book's single embedded `style` is autosaved with Saving/Saved/Error feedback, survives reload, and retains my local choice on retryable failure.
3. **Given** I clear every preset and Custom Instruction, **when** intake or an update commits, **then** the configured default preset becomes the canonical active Style; selecting more than two presets, unknown/duplicate preset ids, malformed input, or Custom Instruction over 1,000 UTF-16 code units is rejected server-side on both paths.
4. **Given** another tab has changed the Style, **when** my stale update reaches the server, **then** it receives `409` with the canonical Style and `styleRevision`; my local edits stay visible until I explicitly Reload saved version or deliberately Keep mine against the returned canonical revision.
5. **Given** a Style change succeeds, **when** a later Generation or regeneration reaches `composePrompt`, **then** it reads the live Book Style, resolves the selected preset descriptions server-side in selection order, appends trimmed Custom Instruction once, and makes one registry-resolved LLM generation call; cached manuscript retrieval does not freeze the old Style.
6. **Given** accepted Scenes or an active generated candidate already exist, **when** the Style changes, **then** their prose and provenance remain untouched; an already-composed/in-progress idempotent operation keeps its captured result, while the next new operation composed after the commit uses the new Style.
7. **Given** the preset catalog is deployed, **when** it is loaded by intake, Chat, or prompt composition, **then** one canonical configurable data file supplies stable unique ids, a valid default, non-empty characteristic-based labels/descriptions, and no real person's name; inactive/deprecated entries remain resolvable for existing Books but are not offered for new selection.

## Tasks / Subtasks

- [x] Task 1: Define the canonical Style contract and catalog (AC: 1, 3, 7)
  - [x] Add optional `styleRevision` to `Book`, initialize new Books at `0`, and treat missing legacy values as `0`; do not reuse or increment `manuscriptRevision` for Style-only changes.
  - [x] Move the six existing preset ids, labels, descriptions, `active` flags, and default id into one deploy-time data file under `functions/config/`; preserve every existing id exactly.
  - [x] Treat the current six entries and `warm-character-driven` default as a replaceable V1 deployment seed pending a later PM catalog revision. Future replacements must preserve old ids as inactive entries while any Book still references them.
  - [x] Add a validated server loader/type for the catalog. Fail fast on duplicate/blank ids, missing or inactive default, blank labels/descriptions, invalid `active` flags, or invalid shape.
  - [x] Cover the exact V1 seed strings with a regression test and require PM/content review for catalog changes; do not pretend an automated validator can recognize every real person's name.
  - [x] Remove the duplicated frontend preset definitions after intake and Chat consume the server catalog; do not add a Firestore Style collection.
  - [x] Define canonical `Style` normalization: preserve selected order, allow one/two presets, allow custom-only, trim Custom Instruction, and apply the configured default only when both choices are empty.

- [x] Task 2: Centralize validation, composition, and revisioned persistence (AC: 2-7)
  - [x] Add a style service seam that supports legacy-safe reads, default/empty normalization, strict request validation, deterministic instruction composition, and Book Style persistence.
  - [x] Both `createBook` intake and Style updates reject unknown ids, duplicate ids, more than two ids, non-string fields, and Custom Instruction over 1,000 UTF-16 code units; do not silently filter, truncate, deduplicate, or replace a non-empty invalid selection.
  - [x] Persist updates in a Firestore transaction using `expectedRevision`; update only `style` and incremented `styleRevision`.
  - [x] On revision mismatch, return a typed conflict containing the canonical Style/revision. Missing Books remain distinct from conflicts.
  - [x] Preserve only intake's valid normalization behavior: custom-only is valid and a fully skipped Style resolves to the configured default. Harden malformed intake Style payloads to return `400`.
  - [x] Add service tests for all valid combinations, empty/default behavior, ordering, validation failures, legacy Books, concurrent revisions, and proof that Scenes, messages, accepted prose, and `manuscriptRevision` are untouched.

- [x] Task 3: Add authenticated Style read/update handlers (AC: 1-4, 7)
  - [x] Add `getStyleConfig`: authenticated callers can load the catalog for intake; with `bookId`, verify ownership and return the canonical Book Style plus `styleRevision`.
  - [x] Add `updateBookStyle` accepting only `{bookId, style, expectedRevision}`; verify Firebase ID token, load the Book, enforce `book.uid === caller.uid`, validate before persistence, and delegate all Firestore work to the service.
  - [x] Return established `{code,message}` errors: `400` invalid argument, `401` auth/ownership, `404` missing Book, `409` canonical conflict, and `200` canonical Style/revision.
  - [x] Use `allowedOrigins()` and bind no model-provider secrets; changing Style never calls an LLM.
  - [x] Add handler tests for authentication, ownership, catalog-only read, owned-Book read, validation, missing Book, conflict payload, and successful delegation.

- [x] Task 4: Keep every Generation on the live canonical Style (AC: 5-7)
  - [x] Replace `composePrompt`'s local preset lookup with the canonical server loader/service.
  - [x] Compose one deterministic instruction in selected order with each preset description exactly once and Custom Instruction appended once under an explicit delimiter.
  - [x] Preserve AD-4: initial Generation and regeneration always reread Book/Vision live at `composePrompt`, even when regeneration reuses cached retrieval.
  - [x] Do not add another LangGraph/model node or provider call. The existing `generate` registry task remains the only prose call, with OpenAI primary and Gemini fallback.
  - [x] Add tests proving one preset, ordered two-preset blend, custom-only, combined Style, changed Style on the next Generation, changed Style during cached-context regeneration, one model service invocation, and no mutation of prior accepted/candidate prose.

- [x] Task 5: Add runtime-safe frontend Style APIs (AC: 1-4, 7)
  - [x] Add a single frontend Style module with runtime parsers for catalog, canonical Style/revision, normal success, and `409` conflict responses; no TypeScript assertion may stand in for network validation.
  - [x] Expose authenticated catalog/read/update helpers and stable React Query keys without introducing direct client Firestore writes.
  - [x] Reuse the Style parser in Book list/vision payload handling so malformed `customInstruction` or preset arrays fail closed consistently.
  - [x] Add parser/API tests for valid and malformed catalogs, legacy revision fallback, successful updates, conflicts, and non-JSON/error responses.

- [x] Task 6: Build the integrated Book Chat Style control (AC: 1-6)
  - [x] Add a compact Palette icon control beside the Book Chat heading/current voice summary and open the existing Sheet primitive; keep the writing surface as the first screen and add no settings route.
  - [x] Render characteristic presets as accessible toggle controls with at most two active. A third choice is blocked with an accessible validation message rather than silently removing another choice.
  - [x] Add a bounded Custom Instruction textarea with character count. Support preset-only, blend, custom-only, and preset-plus-custom states.
  - [x] Implement coalesced single-flight autosave with a 500-750 ms debounce, Saving/Saved/Error state, explicit retry, and local state retention on every failure.
  - [x] On `409`, keep local choices visible, pause automatic commits, and show that a newer saved Style exists. Provide Reload saved version and deliberate Keep mine actions; Keep mine resubmits the retained local Style once against the canonical revision returned by the conflict.
  - [x] Ignore stale responses after `bookId` changes; reset panel state between Books. A catalog/style load failure must not block message loading, scene generation, or existing Scene Review cards.
  - [x] Define timing honestly: an operation uses the Style read when its `composePrompt` runs. Do not reset or bypass an existing generation idempotency key merely because Style changed.
  - [x] Add component/route tests for load, one/two/custom combinations, third-selection guard, autosave coalescing, retry, conflict/reload, route switch, narrow viewport Sheet layout, and unchanged generation/review workflows.

- [x] Task 7: Migrate intake to the canonical catalog without regressions (AC: 1, 3, 7)
  - [x] Replace `src/lib/style-presets.ts` use in `books.new.tsx` with the authenticated server catalog; preserve the existing guided conversation and local intake draft.
  - [x] If catalog loading fails, keep premise answers/draft intact and provide retry; do not submit unknown ids or restore a hard-coded client fallback list.
  - [x] Keep fully skipped Style and custom-only payload behavior compatible with server normalization, while surfacing strict server rejection for invalid/non-canonical selections.
  - [x] Update intake tests for catalog loading, selection ordering, custom-only, default-on-skip, load retry, malformed catalog handling, unknown/duplicate ids, more than two ids, and oversized Custom Instruction.

- [x] Task 8: Wire deployment and retain the server-authoritative boundary (AC: 1-4, 7)
  - [x] Export both handlers, add Hosting rewrites before the SPA fallback, and add them to a quota-safe Functions batch in `.github/workflows/firebase-deploy.yml`.
  - [x] Ensure the canonical catalog file is included in the Functions deployment package and available from compiled code.
  - [x] Keep Firestore Book writes denied to clients and config/session data unreadable; Admin SDK handlers remain the only Style mutation path.
  - [x] Extend static/rules seam tests. Do not relax production rules or add provider secrets for Style endpoints.

- [x] Task 9: Verify end to end and update story records (AC: 1-7)
  - [x] Run focused red/green tests, full frontend tests/build, targeted frontend ESLint, Functions `npm run verify`, seam lint, catalog validation, and `git diff --check`.
  - [x] Deploy through the existing GitHub pipeline and confirm its sequential quota-safe Function rollout succeeds.
  - [x] Prove exact instruction composition and one model-service invocation in automated tests; do not log or persist composed prompts for live inspection.
  - [x] When writer credentials are available, verify live: load active Style, blend two, add custom guidance, reload, generate/regenerate successfully, confirm one usage entry per operation, and confirm previously accepted Scene data is unchanged; restore the test Book's prior Style and remove test data.
  - [x] Update File List, completion notes, Change Log, and sprint status only after verification passes.

### Review Findings

- [x] [Review][Patch] Keep inactive presets visible/removable for existing Books and permit valid updates that retain or replace a deprecated selection [functions/src/services/styles.ts:130]
- [x] [Review][Patch] Normalize legacy overlong custom instructions on Book-list reads so one old Book cannot invalidate the entire shelf response [functions/src/services/books.ts:47]
- [x] [Review][Patch] Use a request-generation token to reject stale A -> B -> A Style loads [src/components/book/StyleControl.tsx:73]
- [x] [Review][Patch] Clear the Style single-flight promise only when the settling request still owns the ref [src/components/book/StyleControl.tsx:158]
- [x] [Review][Patch] Enforce the 1,000 UTF-16-unit request limit before trimming whitespace [functions/src/services/styles.ts:143]
- [x] [Review][Patch] Preserve overlong restored intake guidance and surface validation instead of silently truncating writer text [src/routes/books.new.tsx:118]
- [x] [Review][Patch] Validate canonical Style preset ids against the returned catalog while still accepting known inactive ids [src/lib/styles.ts:84]
- [x] [Review][Patch] Add the claimed autosave-coalescing, conflict resolution, narrow layout, canonical intake, live-style generation, and exact-composition tests [src/components/book/StyleControl.test.tsx:1]

## Dev Notes

### Authoritative Decisions

- `Book.style` remains the single active Style and contains only `presetIds` plus optional `customInstruction`. `styleRevision` is a sibling Book field used only for optimistic concurrency.
- Catalog source: one deploy-time JSON data file under `functions/config/`, loaded and validated by the backend and returned to authenticated clients. The current six presets are the replaceable V1 seed, not a claim that the PRD's PM catalog question is permanently settled. Do not add a second frontend list or a runtime Firestore registry for this story.
- Empty preset/custom selection means "use the configured default." Custom-only remains a valid distinct Style.
- Preset order is the user's selection order and is semantically significant for deterministic composition. Duplicate ids are invalid. Inactive catalog entries remain resolvable for legacy Books but cannot be newly selected.
- A Style change updates no accepted Scene, candidate, message, usage entry, chapter, or manuscript revision and triggers no LLM call.
- Operations already composed or replayed under an existing idempotency key are not retroactively changed. A new Generation/regeneration whose compose step begins after the Style commit reads the new value.
- The Epic's "single Gemini call" wording is stale. AD-9 is authoritative: one registry-resolved generation call, currently OpenAI primary with Gemini fallback.

### Current Code To Extend

- `functions/src/types/book.ts` already defines `Style { presetIds, customInstruction }`; extend it rather than inventing another style shape.
- `functions/src/services/books.ts` currently silently filters, deduplicates, and truncates intake Style. Move reusable logic behind the Style service, preserve custom-only and fully-skipped behavior, and make malformed non-empty intake selections fail validation.
- `functions/src/config/stylePresets.ts` and `src/lib/style-presets.ts` contain identical six-item lists. Replace both with one canonical server data source.
- `functions/src/pipelines/composePrompt.ts` already reloads Book/Vision live and concatenates style text. Preserve the live read, replace lookup/composition with the canonical service, and retain one model call.
- `functions/src/pipelines/generate.ts` already re-enters at `composePrompt` for regeneration and uses the registry-backed generation service.
- `src/routes/books.$bookId.chat.tsx` already protects generation idempotency, retains failed input, resets on `bookId`, ignores stale generation/message responses, and renders Story 2.4 Scene Review cards. The Style control must not regress any of these behaviors.
- `src/routes/books.new.tsx` already supports two presets, custom-only, default-on-skip, intake draft persistence, and idempotent Book creation. Only replace its catalog source and add resilient loading.
- `firestore.rules` denies every direct Book write; no rules expansion is needed.

### Architecture Compliance

- Keep `handlers -> services` for Style reads/updates and `handlers -> pipelines -> services` for Generation. Handlers authenticate/authorize; services own Firestore and catalog access.
- AD-4: generation sessions cache retrieval only; Style/Vision/Threads remain live compose inputs.
- AD-6: Style is embedded on the Book document; no Style collection.
- AD-7: verify ID token and `book.uid === caller.uid` in handlers; never trust client tenancy.
- AD-9: all model calls remain in the existing provider registry/service and persist provider/model usage normally.
- Errors use `{code,message}`; `409` additionally carries canonical Style/revision.
- Firebase Functions remain Node.js 22. New endpoints use Hosting rewrites with explicit `us-central1`.

### Libraries and UX

- Use installed React 19, TanStack Router/Query, Firebase Functions/Admin SDK, Vitest, Testing Library, Tailwind, Lucide, and the existing Radix Sheet/Toggle primitives. Add no dependency.
- The PRD's in-Chat requirement is binding. UI Story 2.3's slide-out panel is supplemental and fits the existing Sheet primitive.
- Keep the panel compact, keyboard accessible, responsive, and work-focused. Do not add a landing/settings page, nested cards, continuous style sliders, author imitation, or a large catalog.

### File Structure

Expected new files:
- `functions/config/style-presets.json`
- `functions/src/types/styleConfig.ts`
- `functions/src/services/styles.ts` and tests
- `functions/src/handlers/getStyleConfig.ts` and test
- `functions/src/handlers/updateBookStyle.ts` and test
- `src/lib/styles.ts` and test
- `src/components/style/StyleControl.tsx` and test

Expected updates:
- `functions/src/types/book.ts`
- `functions/src/services/books.ts` and tests
- `functions/src/pipelines/composePrompt.ts` and tests
- `functions/src/pipelines/generate.test.ts`
- `functions/src/index.ts`
- `src/lib/books.ts` and tests
- `src/routes/books.new.tsx` and tests
- `src/routes/books.$bookId.chat.tsx` and tests
- `firebase.json`
- `firestore.rules` static tests
- `.github/workflows/firebase-deploy.yml`

Expected removals after migration:
- `functions/src/config/stylePresets.ts`
- `src/lib/style-presets.ts`

### Testing Requirements

- Test-first each service/handler/UI boundary. Service tests must exercise Firestore transaction behavior, not only handler mocks.
- Handler tests prove auth, ownership, validation, status mapping, canonical conflicts, and zero direct Firestore access.
- Prompt tests inspect the final instruction and model-service call count; do not assert only that a `Style` object was returned.
- Frontend tests use roles/labels, fake timers for debounce, deferred promises for coalescing/double-action guards, explicit route rerenders, and malformed network payloads.
- Preserve all Story 2.1-2.4/2.3a regression coverage.
- Firestore emulator execution still requires Java, which was unavailable during Story 2.4. Run static rules coverage and production rule compilation, and report emulator verification honestly if Java remains absent.

### Scope Boundaries

- No continuous sliders, author-name imitation, AI-generated Style creation, preset administration UI, per-scene Style overrides, retroactive rewriting, style history/rollback, usage indicator (Story 2.6), or Epic 3 memory/Muse work.
- Do not add a separate Style route or direct client Firestore write.
- Do not change model/provider selection, generation idempotency, Scene acceptance, or cached retrieval design.

### Previous Story and Git Intelligence

- Story 2.4 added revision/CAS conflict handling, single-flight UI mutations, runtime network validation, stale-book/session guards, live `composePrompt` on regeneration, and server-authoritative Book/Scene writes. Reuse those patterns.
- Story 2.4 also established that `manuscriptRevision` fences accepted manuscript state only; Style needs its own revision and must not invalidate retrieval cache.
- Recent review commits fixed malformed response handling, stale cross-book state, duplicate actions, and non-transactional writes. Preserve current source behavior rather than copying older story code.
- CI now deploys Functions in sequential quota-safe batches. Add the two Style handlers to an existing/new small batch; do not restore one all-at-once Function deploy.

### Latest Technical Notes

- Firebase's current Functions documentation supports Node.js 22, matching `firebase.json` and `functions/package.json`.
- Firestore transactions retry on concurrent document changes and apply all writes atomically. Keep transaction callbacks free of UI/external side effects.
- Firebase Hosting function rewrites apply only after static files; place explicit API rewrites before the final SPA `**` destination.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.5-Change-My-Books-Voice-at-Any-Time]
- [Source: _bmad-output/planning-artifacts/prds/prd-Story-2026-07-25/prd.md#FR-6]
- [Source: _bmad-output/planning-artifacts/prds/prd-Story-2026-07-25/prd.md#User-Journey-3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/ARCHITECTURE-SPINE.md#AD-9]
- [Source: design-artifacts/E-Development/ui-epics.md#UI-Story-2.3-Integrated-Style-Panel]
- [Source: _bmad-output/implementation-artifacts/2-4-refine-and-keep-the-scene.md]
- [Source: https://firebase.google.com/docs/firestore/manage-data/transactions]
- [Source: https://firebase.google.com/docs/functions/manage-functions]
- [Source: https://firebase.google.com/docs/hosting/functions]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Red/green focused suites: Style service, handlers, prompt composition, frontend API, Style control, intake, and Book parsing.
- Full frontend: `bun run test` - 20 files / 103 tests passed.
- Frontend production build: `bun run build` passed; targeted ESLint and `git diff --check` passed.
- Backend: `npm run verify` - lint, seam lint, build, 22 files / 169 tests passed.
- Compiled catalog smoke: built `lib/services/styles.js` loaded `warm-character-driven` and all 6 presets.
- Deployment: GitHub Actions run `30354302468` for `f051a37` succeeded, including Hosting, Firestore, registry seeding, and all sequential Functions batches.
- Live unauthenticated smoke: `/login` returned 200; `/getStyleConfig` and `/updateBookStyle` returned 401 without a token.
- Code-review verification: frontend 20 files / 113 tests and production build; Functions 22 files / 177 tests with lint, seam lint, and TypeScript build.
- Review deployment: GitHub Actions run `30389635376` completed successfully with Hosting deployed only after all required Function batches.

### Completion Notes List

- Added the canonical deploy-time Style catalog, strict validation/default normalization, deterministic prompt composition, and independent `styleRevision` CAS persistence.
- Added authenticated catalog/read/update handlers with ownership enforcement and canonical 409 conflict responses; direct client Book writes remain denied.
- Added the responsive in-Chat Style Sheet with ordered presets, custom guidance, coalesced autosave, retry, conflict recovery, stale-route guards, and canonical-default adoption.
- Migrated new-book intake and Book response parsing to runtime-validated server Style data; removed both duplicated TypeScript catalogs.
- Preserved one registry-resolved model call and live Style reads for generation/regeneration without mutating prior prose, candidates, or manuscript revision.
- Authenticated live mutation/generation cleanup was not repeated because this environment contains no writer credentials; this conditional gap is reported explicitly.
- Closed all review findings: deprecated-style retention/removal, legacy normalization, stale-load and save-ownership guards, raw input limits, non-destructive draft restoration, catalog-bound response validation, and the missing autosave/conflict/responsive tests.

### File List

- `.github/workflows/firebase-deploy.yml`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `firebase.json`
- `functions/config/style-presets.json`
- `functions/src/config/stylePresets.ts` (removed)
- `functions/src/handlers/createBook.test.ts`
- `functions/src/handlers/createBook.ts`
- `functions/src/handlers/getStyleConfig.test.ts`
- `functions/src/handlers/getStyleConfig.ts`
- `functions/src/handlers/updateBookStyle.test.ts`
- `functions/src/handlers/updateBookStyle.ts`
- `functions/src/index.ts`
- `functions/src/pipelines/composePrompt.test.ts`
- `functions/src/pipelines/composePrompt.ts`
- `functions/src/pipelines/generate.test.ts`
- `functions/src/services/books.test.ts`
- `functions/src/services/books.ts`
- `functions/src/services/firestoreRules.test.ts`
- `functions/src/services/styles.test.ts`
- `functions/src/services/styles.ts`
- `functions/src/types/book.ts`
- `functions/src/types/styleConfig.ts`
- `functions/src/types/stylePreset.ts` (removed)
- `src/components/book/StyleControl.test.tsx`
- `src/components/book/StyleControl.tsx`
- `src/lib/books.test.ts`
- `src/lib/books.ts`
- `src/lib/style-presets.ts` (removed)
- `src/lib/styles.test.ts`
- `src/lib/styles.ts`
- `src/routes/books.$bookId.chat.test.tsx`
- `src/routes/books.$bookId.chat.tsx`
- `src/routes/books.new.test.tsx`
- `src/routes/books.new.tsx`

## Change Log

- 2026-07-28: Implemented and deployed server-authoritative, revisioned Book Style selection and live generation composition; moved story to review.
- 2026-07-29: Applied all code-review patches and moved Story 2.5 to done.

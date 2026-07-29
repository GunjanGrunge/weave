---
baseline_commit: 82c6ce8cd2bca0d560351ddc3cd337867034346e
---

# Story 3.1: The Book Remembers What I Write

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a writer deep into a manuscript,
I want the app to quietly learn my characters, places, and facts as I accept scenes,
so that later scenes stay consistent without me maintaining notes.

## Acceptance Criteria

1. **Given** I accept a Scene, **when** the accept write lands in Firestore, **then** an event-triggered Extraction pipeline (`extractEntities` → `embedFacts` → `upsertFacts`) runs independently of my accept response (AD-5), prompting the registry-pinned `gemini-3.5-flash-lite` model (under configuration `entityExtraction`) for structured JSON and upserting facts into `books/{bookId}/facts` — merging into existing entity docs (the "Elena" doc updates, never duplicates).
2. **And** each fact doc carries a `gemini-embedding-2` vector at 768 dimensions (under configuration `embedding`), and the one `facts` collection-group vector index serves it (AD-2/AD-9).
3. **And** the extraction and embedding calls are recorded in the usage log (`books/{bookId}/usage`).
4. **Given** extraction fails for any reason, **when** the failure occurs, **then** it fails silently with no user-facing error and no effect on the accepted Scene (FR-11 graceful degradation) — background infrastructure, not a user action.
5. **Given** any extraction output, **when** facts are stored, **then** no Narrative Thread content (especially hidden meanings) ever appears in the facts store — extraction reads only manuscript text (AD-11).

## Tasks / Subtasks

- [x] Task 1: Update security rule verification (AC: 2)
  - [x] Add check to [functions/src/services/firestoreRules.test.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/services/firestoreRules.test.ts) verifying `books/{bookId}/facts/{factId}` has `allow read: if ownsBook(bookId);` and `allow write: if false;`.
- [x] Task 2: Update usage logging type (AC: 3)
  - [x] Add `"entityExtraction"` and `"embedding"` to `UsageTask` in [functions/src/types/usage.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/types/usage.ts).
- [x] Task 3: Implement extraction background trigger (AC: 1, 3, 4, 5)
  - [x] Create `functions/src/triggers/extractEntities.ts` setting up a 2nd-gen Cloud Function `onDocumentCreated` for path `books/{bookId}/chapters/{chapterId}/scenes/{sceneId}`.
  - [x] Configure secrets: `secrets: [GOOGLE_API_KEY, OPENAI_API_KEY]`.
  - [x] Wrap the entire logic in a broad try-catch for silent failure/graceful degradation (log via `console.error` and exit cleanly).
  - [x] Prompt the pinned `entityExtraction` model with ONLY the scene manuscript text. Do not provide vision doc or narrative threads. Structure the prompt to only extract explicit, factual entities (characters, locations, key facts) and their descriptions.
  - [x] Use JSON schema mode for structured extraction output.
- [x] Task 4: Implement merging, embedding, and storing facts (AC: 1, 2, 3)
  - [x] For each extracted entity/fact:
    - [x] Clean/sanitize the entity name to construct a safe Firestore document ID (e.g., removing characters like `/` or leading/trailing whitespace).
    - [x] Look up the existing fact doc under `books/{bookId}/facts/{entityName}`.
    - [x] If it exists, call the model (`entityExtraction` configuration) to merge the existing description and new extracted details into a single updated description/summary. Record the merge call in the usage log.
    - [x] Compute the embedding vector (768 dimensions) for the updated description using `gemini-embedding-2` (`embedding` configuration). Record the embedding call in the usage log.
    - [x] Store/update the document `books/{bookId}/facts/{entityName}` with `name`, `type`, `description`, `embedding` vector, and `updatedAt` timestamp.
- [x] Task 5: Export trigger and verify all checks (AC: 1-5)
  - [x] Export `extractEntitiesOnSceneAccept` in [functions/src/index.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/index.ts).
  - [x] Write unit tests in `functions/src/triggers/extractEntities.test.ts` mocking Firestore document events, Gemini calls, and asserting extraction, merge, embedding, and usage logging behavior.
  - [x] Run verification tests and verify: `npm run verify` passes cleanly inside the `functions` directory.

## Review Findings

- [x] [Review][Patch] Add the required 768-dimensional `facts.embedding` vector index and wire it into Firebase configuration.
- [x] [Review][Patch] Add `extractEntitiesOnSceneAccept` to the CI Functions deployment list.
- [x] [Review][Patch] Make event re-delivery idempotent so one accepted scene cannot repeat extraction, model usage, or writes.
- [x] [Review][Patch] Prevent concurrent entity merges from losing updates.
- [x] [Review][Patch] Prevent distinct normalized entity names from colliding on the same fact document ID.
- [x] [Review][Patch] Route context-query embedding usage through the central usage-accounting path.

The review fixes, vector index, and `asia-south1` extraction trigger were deployed
on 2026-07-29. The full backend verification passed with 233 tests.

## Dev Notes

### Relevant Architecture Patterns and Constraints
- **Async Decoupling (AD-5):** Background extraction runs as a Firestore-triggered function, completely asynchronous from the user-facing scene-accept response.
- **Model Registry (AD-9):** Read configurations `entityExtraction` and `embedding` from `config/geminiModels` via `readModelRegistry()`.
- **Text-Truth Separation (AD-11):** Facts are extracted strictly from the scene manuscript text. Narrative threads must never be input to the extraction or merge prompts.
- **Usage Logging (AC-3):** Record every API call (extraction, merge, embedding) to `books/{bookId}/usage` using `recordUsageBestEffort`.

### Source Tree Components to Touch
- [functions/src/types/usage.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/types/usage.ts) (Modify)
- [functions/src/services/firestoreRules.test.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/services/firestoreRules.test.ts) (Modify)
- [functions/src/index.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/index.ts) (Modify)
- [functions/src/triggers/extractEntities.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/triggers/extractEntities.ts) (New)
- [functions/src/triggers/extractEntities.test.ts](file:///c:/Users/Bot/Desktop/Story/functions/src/triggers/extractEntities.test.ts) (New)

### Testing Standards Summary
- Trigger logic is validated with unit tests using mocked Firestore snaps and Gemini/OpenAI API responses.
- Verify security rules, seam lints, and node types build and compile without issues.

### Project Structure Notes
- Alignment with ESM import patterns (`.js` suffixes for relative imports).
- Keeps trigger function logic modular and fully tested.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/solution-design.md#Two layers of memory]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

2026-07-29 repository-wide code review and deployment/configuration remediation.

### Completion Notes List

- Implementation and unit coverage were found in the repository even though this
  artifact still showed `ready-for-dev` with unchecked tasks.
- Added Firebase index/deployment configuration for the trigger and vector query.
- Story remains in `review` pending CI deployment and authenticated production
  verification of the trigger and vector query.

### File List

- `firestore.indexes.json`
- `firebase.json`
- `.github/workflows/firebase-deploy.yml`
- `functions/src/index.ts`
- `functions/src/services/firestoreRules.test.ts`
- `functions/src/triggers/extractEntities.ts`
- `functions/src/triggers/extractEntities.test.ts`
- `functions/src/types/usage.ts`

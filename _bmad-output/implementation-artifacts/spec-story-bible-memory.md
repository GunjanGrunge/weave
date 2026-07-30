---
title: 'Give Every Book Canonical Character Memory'
type: 'feature'
created: '2026-07-31'
status: 'done'
review_loop_iteration: 0
baseline_commit: '59648213701e09ce6985a443ec5561712b951f7f'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Story-2026-07-25/solution-design.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-Story-2026-07-25/prd.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** WEAVE stores semantically retrieved fact summaries but has no complete, reviewable character roster or temporal state. Generations can omit established traits, contradict a character's present state, or introduce unrequested named characters.

**Approach:** Add a per-book Story Bible whose character profiles are reconciled from source-scoped scene extraction plus explicit author overrides. Always include its compact canonical roster in generation and expose profiles, state history, verification, locks, and corrections in an authenticated book route.

## Boundaries & Constraints

**Always:** Keep text-derived evidence separate from author overrides; retain source chapter/scene provenance; preserve locked author values during extraction; distinguish stable traits, current state, and timeline events; treat flashback evidence as historical rather than a present-state mutation; scope every read/write to an owned Book; update memory idempotently on scene create/update/delete; preserve available canonical context across regenerate; degrade generation only when a new Book genuinely has no characters, while surfacing stale/rebuild-required memory.

**Ask First:** Any migration that rewrites manuscript prose, automatically resolves an ambiguous contradiction, or sends existing manuscript content to a new provider/model configuration.

**Never:** Silently rewrite the manuscript; infer hidden Narrative Thread meanings into text-truth; expose embeddings; let extraction overwrite locked fields; treat deleted prose as current evidence; build a decorative relationship graph without persisted relationship edges; add conversational co-author, split workspace, selective revision review, or proactive Muse UI in this spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New accepted scene | Present-timeline character evidence | Source manifest and materialized profile update once; roster affects next generation | Extraction failure leaves prior memory intact and marks memory stale |
| Flashback | Character appears younger historically | Timeline records younger state without changing present age | Ambiguous chronology is unverified, not promoted |
| Author correction | Writer locks Mr. Bell as age 72 | Override wins in UI and every generation | Stale version returns conflict without lost updates |
| Scene edit/delete | Evidence changes or disappears | Reconcile affected profiles from remaining sources and overrides | Failure marks rebuild required; prior verified profile is not silently erased |
| Existing book | Legacy character facts but no profiles | Seed unverified profiles from character facts without inventing structured traits | UI labels migration state and allows correction |

</frozen-after-approval>

## Code Map

- `functions/src/triggers/extractEntities.ts` -- extend extraction and reconcile source-scoped character evidence on scene writes.
- `functions/src/services/storyBible.ts` -- materialize profiles, apply locks/overrides, resolve temporal state, migrate legacy facts, and build compact roster context.
- `functions/src/types/storyBible.ts` -- shared server contracts for traits, state, timeline, provenance, verification, and versions.
- `functions/src/pipelines/assembleContext.ts` / `composePrompt.ts` -- carry the canonical roster through generate/regenerate and enforce continuity.
- `functions/src/handlers/getStoryBible.ts` / `updateStoryBibleCharacter.ts` -- authenticated owner-scoped read and optimistic author edits.
- `functions/src/handlers/rebuildStoryBible.ts` -- owner-scoped backfill request for existing accepted scenes without rewriting prose.
- `src/routes/books.$bookId.story-bible.tsx` -- character directory and focused profile editor.
- `src/lib/story-bible.ts` / `src/components/book/BookTools.tsx` -- client contracts and book navigation.
- `firestore.rules`, `firebase.json`, `.github/workflows/firebase-deploy.yml` -- secure reads and deploy new endpoints/trigger shape.

## Tasks & Acceptance

**Execution:**
- [x] Add red tests for temporal reconciliation, locked overrides, source removal, legacy migration, roster persistence, prompt constraints, ownership, and UI states.
- [x] Implement Story Bible types/service and scene-write reconciliation while retaining general semantic `facts`.
- [x] Add authenticated read/update handlers, rules, exports, rewrites, and deployment coverage.
- [x] Include the compact active roster in initial generation and regeneration; prohibit new named/recurring characters unless explicitly requested.
- [x] Build the responsive, dark-mode Story Bible route with character list, provenance, current state, timeline, verification badges, editable locks, conflicts, and empty/loading/error states.
- [x] Add Story Bible navigation to Chat, Manuscript, and Vision; verify the existing live book can rebuild from accepted scenes without manuscript mutation.

**Acceptance Criteria:**
- Given an established present-day trait, when a later scene is generated, then the prompt includes that canonical value and a flashback may vary it only in an explicit historical context.
- Given no explicit request for a new character, when prose is generated or regenerated, then the model is instructed not to introduce a new named or recurring character.
- Given extraction conflicts with a locked author correction, when reconciliation runs, then the locked value remains canonical and the conflicting evidence is visible for review.
- Given source prose is edited or deleted, when reconciliation completes, then removed evidence stops influencing future generations while author overrides and valid remaining evidence persist.
- Given an owned existing Book, when Story Bible opens, then legacy character facts appear as unverified profiles and can be corrected without exposing embeddings.

## Spec Change Log

## Design Notes

`facts` remains semantic text-truth for retrieval. Story Bible adds materialized character profiles backed by per-scene manifests and author-owned overrides. Profile rebuilds operate from manifests, making scene deletion reversible and preventing an LLM-merged paragraph from becoming irreducible canonical state. Relationship edges can extend the same source/override model later.

## Verification

**Commands:**
- `bun run test && bun run build` -- 156 frontend tests and production build pass.
- `cd functions && npm run verify` -- lint, seam checks, TypeScript, and 293 backend tests pass.
- `git diff --check` -- no whitespace defects.

**Manual checks (if no CLI):**
- Sign in, open the existing two-chapter book, confirm migrated characters are visible as unverified, lock a test correction, and verify a read-only generation-context probe uses it without modifying manuscript text.

**Implementation evidence:**
- Dark-mode browser checks passed at 1440x900 and 390x844 with no clipping, overflow, or console errors.
- The live book was inspected read-only: it has two accepted scenes and no legacy fact documents, so the empty state now offers an explicit owner-authorized `Build from manuscript` action that retriggers the existing extraction model without changing scene text.
- Adversarial review patches protect concurrent locks, partial rebuild state, stale extraction, snapshot corrections, bounded context, strict validation, and cross-book UI requests.

## Suggested Review Order

**Canonical Memory**

- Start with transactional, source-scoped profile reconciliation and author override preservation.
  [`storyBible.ts:498`](../../functions/src/services/storyBible.ts#L498)

- Review explicit rebuild tracking for existing manuscripts without prose mutation.
  [`storyBible.ts:632`](../../functions/src/services/storyBible.ts#L632)

- Follow scene writes through stale-result fencing and best-effort semantic facts.
  [`extractEntities.ts:219`](../../functions/src/triggers/extractEntities.ts#L219)

**Generation Safety**

- See canonical roster assembly with manuscript and Story Bible revision fencing.
  [`assembleContext.ts:68`](../../functions/src/pipelines/assembleContext.ts#L68)

- Inspect prompt constraints that prohibit unrequested named or recurring characters.
  [`composePrompt.ts:67`](../../functions/src/pipelines/composePrompt.ts#L67)

- Confirm snapshot restores retain author corrections while rebuilding text-derived evidence.
  [`snapshots.ts:397`](../../functions/src/services/snapshots.ts#L397)

**Author Experience**

- Review responsive character browsing, correction locks, recovery, and request-race handling.
  [`books.$bookId.story-bible.tsx:445`](../../src/routes/books.$bookId.story-bible.tsx#L445)

- Trace authenticated client reads, updates, and manuscript rebuild requests.
  [`story-bible.ts:72`](../../src/lib/story-bible.ts#L72)

- Check book-level navigation into the Story Bible.
  [`BookTools.tsx:184`](../../src/components/book/BookTools.tsx#L184)

**Boundaries And Tests**

- Verify owner-scoped validation and optimistic character updates.
  [`updateStoryBibleCharacter.ts:92`](../../functions/src/handlers/updateStoryBibleCharacter.ts#L92)

- Review temporal, locking, alias, rebuild, and payload-boundary coverage.
  [`storyBible.test.ts:39`](../../functions/src/services/storyBible.test.ts#L39)

- Review responsive, stale-recovery, rename-lock, and route-race coverage.
  [`books.$bookId.story-bible.test.tsx:124`](../../src/routes/books.$bookId.story-bible.test.tsx#L124)

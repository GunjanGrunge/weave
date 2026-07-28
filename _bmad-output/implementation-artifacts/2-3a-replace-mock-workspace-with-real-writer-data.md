# Story 2.3a: Replace the Mock Workspace With Real Writer Data

Status: done

## Story

As a writer,
I want every visible book and workspace action to use my persisted data,
so that I can leave and return without losing access to my manuscript.

## Acceptance Criteria

1. **Given** I am signed in, **When** I open the dashboard or bookshelf, **Then** only books owned by my Firebase UID are loaded from Firestore and each book opens its real Book Chat.
2. **Given** I start intake but leave before creating the Book, **When** I return on the same browser and account, **Then** the unfinished conversation is restored and can be explicitly discarded.
3. **Given** `/createBook` succeeds, **When** I leave before pressing Continue, **Then** the new Book remains discoverable from the real bookshelf.
4. **Given** the V1 workspace, **When** its active routes and navigation are inspected, **Then** no screen imports `src/lib/mock-data.ts` or presents non-functional mock routes as real features.
5. **Given** a different signed-in writer, **When** they request the book list, **Then** the service queries by their verified UID and never returns another writer's books.

## Tasks

- [x] Add ownership-scoped `listBooks` service and authenticated HTTP handler.
- [x] Add Hosting rewrite, function export, and CI deployment target.
- [x] Replace dashboard and bookshelf mock catalogs with a shared authenticated React Query.
- [x] Preserve the `/books` layout route and `/books/` index route so nested book routes render.
- [x] Autosave unfinished intake per UID in local storage, restore it, provide discard, and clear it after successful creation.
- [x] Remove mock-backed and non-functional placeholder routes from the generated route tree.
- [x] Remove fabricated Top Bar and Settings values.
- [x] Delete `src/lib/mock-data.ts` and verify no imports remain.
- [x] Add frontend and backend tests.

### Review Findings

- [x] [Review][Patch] Validate and normalize Firestore Book summaries so one malformed or legacy document cannot invalidate the writer's entire bookshelf [functions/src/services/books.ts:184] — fixed with safe legacy title/style defaults and regression coverage.
- [x] [Review][Patch] Reject malformed saved intake drafts instead of crashing or deadlocking the intake route [src/routes/books.new.tsx:58] — fixed with field-level runtime validation and invalid-draft cleanup.
- [x] [Review][Patch] Validate successful `createBook` payloads before clearing the recoverable local draft [src/routes/books.new.tsx:280] — fixed with response-shape validation and regression coverage.
- [x] [Review][Patch] Reject empty Book IDs before rendering unusable chat links [src/lib/books.ts:20] — fixed at the API validation boundary.
- [x] [Review][Patch] Keep cached books visible on background refresh failure and avoid reporting an unknown count as zero [src/routes/books.index.tsx:18, src/routes/index.tsx:20] — fixed in both workspace views with dashboard and bookshelf coverage.
- [x] [Review][Patch] Keep desktop collapse state from hiding labels in the mobile drawer, and close the drawer when its active destination is selected [src/components/layout/AppSidebar.tsx:30] — fixed with mobile navigation coverage.
- [x] [Review][Patch] Synchronize theme state between Top Bar and Settings [src/lib/theme.ts:1] — fixed with one observable theme store and regression coverage.
- [x] [Review][Patch] Do not label removed top-level `/chat` as a functional Book Chat route [src/lib/page-label.ts:1] — fixed by matching only nested Book routes.
- [x] [Review][Patch] Make clean-checkout SPA development independent of an untracked root `index.html` [vite.spa.config.ts:6] — fixed with development HTML middleware; root and deep links return 200.
- [x] [Review][Patch] Run preview with the SPA configuration and output directory [package.json:10] — fixed; built root and deep links return 200.

## Dev Agent Record

### Verification

- `functions/npm run verify`: passed lint, seam lint, TypeScript build, 16 test files / 144 tests.
- `bun run test`: 16 files / 78 tests passed.
- `bun run build`: passed; only the existing bundle-size advisory remains.
- Changed frontend files pass targeted ESLint. Repository-wide lint remains unusable because it scans the bundled `.adal` tree and unrelated pre-existing formatting errors.
- Vite dev and preview smoke checks: `/` and `/books/book-1/chat` each returned 200 with the correct SPA entry.
- Local Chromium smoke check: protected `/books` redirects cleanly to `/login` with no page or console errors.
- Root `tsc --noEmit` remains blocked by the pre-existing missing Vitest/Jest-DOM matcher type declarations; runtime tests and production build pass.

### File List

- `.github/workflows/firebase-deploy.yml`
- `firebase.json`
- `functions/src/handlers/listBooks.ts`
- `functions/src/handlers/listBooks.test.ts`
- `functions/src/index.ts`
- `functions/src/services/books.ts`
- `functions/src/services/books.test.ts`
- `src/lib/books.ts`
- `src/lib/books.test.ts`
- `src/lib/page-label.ts`
- `src/lib/page-label.test.ts`
- `src/lib/theme.ts`
- `src/lib/theme.test.ts`
- `src/lib/mock-data.ts` (deleted)
- `src/routes/books.tsx`
- `src/routes/books.index.tsx`
- `src/routes/books.index.test.tsx`
- `src/routes/books.new.tsx`
- `src/routes/books.new.test.tsx`
- `src/routes/index.tsx`
- `src/routes/index.test.tsx`
- `src/routes/settings.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/AppSidebar.test.tsx`
- `src/components/layout/TopBar.tsx`
- `src/routeTree.gen.ts`
- `vite.spa.config.ts`
- `package.json`
- Mock/placeholder route files removed from `src/routes/`.

### Change Log

- 2026-07-28: Adversarial three-chunk code review completed; all confirmed backend, frontend data, navigation, theme, and SPA tooling findings patched and verified. Story moved to done.

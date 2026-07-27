# Story 2.3a: Replace the Mock Workspace With Real Writer Data

Status: review

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

## Dev Agent Record

### Verification

- `functions/npm run verify`: passed lint, seam lint, TypeScript build, 16 test files / 143 tests.
- `bun run test`: 12 files / 67 tests passed.
- `bun run build`: passed; only the existing bundle-size advisory remains.
- Changed frontend files pass targeted ESLint.
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
- `src/lib/mock-data.ts` (deleted)
- `src/routes/books.tsx`
- `src/routes/books.index.tsx`
- `src/routes/books.index.test.tsx`
- `src/routes/books.new.tsx`
- `src/routes/books.new.test.tsx`
- `src/routes/index.tsx`
- `src/routes/settings.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/TopBar.tsx`
- `src/routeTree.gen.ts`
- `vite.spa.config.ts`
- Mock/placeholder route files removed from `src/routes/`.

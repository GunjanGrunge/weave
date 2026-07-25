
## Scope

Frontend-only, no backend. All data is realistic in-memory mocks so every screen feels production-ready. Uses the chosen "Library Desk" direction as the visual + structural reference (warm paper `hsl(40 30% 98%)`, ink foreground, terracotta accent `hsl(15 45% 35%)`, Playfair Display italic display, Lora serif for manuscript, Inter for UI, JetBrains Mono for meta labels).

## Design tokens (src/styles.css)

Overwrite `:root` + `.dark` and `@theme inline` to match the prototype:
- Light: paper background, ink foreground, terracotta accent, subtle border `ink / 8%`.
- Dark: obsidian background (~oklch(0.16 0.01 60)), warm paper foreground, slightly brighter terracotta.
- Radius `--radius: 0.75rem` (rounded 12–16px cards).
- Add font tokens: `--font-display` (Playfair Display italic), `--font-serif` (Lora), `--font-sans` (Inter), `--font-mono` (JetBrains Mono). Load via `<link>` in `__root.tsx` head.
- Add utilities: `.font-display`, `.font-serif`, `.font-mono`, `.animate-reveal` keyframes, drop-cap helper `.drop-cap`.

## Routes (src/routes)

Shared layout: `_app.tsx` renders left sidebar + top bar + `<Outlet />`. Sidebar sections: Workspace (Dashboard, My Books, Chapters), Planning (Characters, World Building, Notes, Research, Timeline), AI (AI Chat, Story Refactor, Consistency), Production (Publishing, Settings). Active state uses accent tint. Top bar shows current book title, AI status pill, word count + progress bar, search icon, notifications, avatar. Each route defines its own head() with unique title/description/og.

1. `index.tsx` → **Dashboard**. Bento: writing streak card (12 days), words today + goal ring, current chapter card, recent books grid (3 cover cards with progress), quick actions row (Continue writing, New chapter, Ask AI, Refactor), activity timeline.
2. `books.tsx` → **My Books**. Grid of book cover cards with status pill, progress, last edited. "New book" tile opens wizard.
3. `books.new.tsx` → **Book creation wizard**. Multi-step conversational panel (Concept → Genre & tone → Cast → Structure → Review) with progress rail; each step is a card with chat-style prompts + form controls; "Create book" CTA.
4. `write.tsx` → **Writing Studio** (signature screen from prototype). Three-pane: chapter list (left inner column), manuscript canvas with drop-cap and generous margins (Lora 19px/1.8, max 65ch), right AI assistant panel with action grid (Rewrite, Improve, Expand, Shorten, Change Style, Continue Writing, Find Plot Holes, Generate Ideas, Explain Feedback), suggested revision card, threaded AI messages, "Ask the Muse" input. Collapsible right panel via toggle button.
5. `characters.tsx` → **Character Manager**. Profile card grid + selected character detail drawer with traits, arc, and a simple SVG relationship graph (nodes/edges rendered inline).
6. `world.tsx` → **World Building**. Tabbed sections: Locations, Timeline (horizontal era ribbon), Maps (image placeholder card), Organizations, Lore. Cards with rounded 16px radius.
7. `chapters.tsx` → **Chapter Planner**. Kanban-style columns (Outline / Drafting / Revision / Done) with draggable chapter cards using `@dnd-kit/core` + `@dnd-kit/sortable` (already available in template or `bun add`). Each card shows word count, progress, POV character.
8. `timeline.tsx` → **Story Timeline**. Vertical event timeline with chapter markers, character lanes overlay, filter chips.
9. `consistency.tsx` → **Consistency Dashboard**. Three columns of issue cards (Character, Timeline, Plot) with severity dots, "Jump to chapter" links, fix suggestions.
10. `research.tsx` → **AI Research workspace**. Split: research chat on left (threaded queries + citations), saved snippets on right (cards).
11. `publishing.tsx` → **Publishing Center**. Manuscript status card, publishing checklist (formatting, cover, metadata, ISBN, KDP/IngramSpark), export buttons.
12. `refactor.tsx` → **Story Refactor** (signature). Header CTA row, left rail with Refactor Scope card (from/to change chip, chapters affected, conflict risks, estimated rewrite) + Consistency Map card, right big before/after diff panel with per-chapter navigation, Accept/Reject/Accept All, and a Version History timeline card at bottom.
13. `settings.tsx` → **Settings**. Profile, appearance (light/dark toggle), AI preferences, keyboard shortcuts.

## Components (src/components)

- `layout/AppSidebar.tsx`, `layout/TopBar.tsx`, `layout/AppShell.tsx`.
- `writing/ChapterList.tsx`, `writing/ManuscriptEditor.tsx` (contenteditable-lite, controlled textarea with serif styling), `writing/AIAssistantPanel.tsx`, `writing/ActionChipGrid.tsx`, `writing/SuggestionCard.tsx`.
- `refactor/ImpactCard.tsx`, `refactor/DiffPane.tsx`, `refactor/VersionHistory.tsx`.
- `characters/RelationshipGraph.tsx` (inline SVG).
- `chapters/ChapterBoard.tsx` (dnd-kit).
- `common/StatusPill.tsx`, `common/ProgressBar.tsx`, `common/SectionLabel.tsx`, `common/ThemeToggle.tsx` (toggles `.dark` on `<html>`, persists to localStorage).
- Mocks in `src/lib/mock-data.ts`: one active book "The Glass Cartographer" with ~14 chapters, ~8 characters, locations, timeline events, consistency issues, refactor diff sample. Reused across routes.

## Interactions

- Sidebar collapse (mini rail w-16) via context.
- Right AI panel collapse in Writing Studio.
- Theme toggle (light/dark) in top bar + settings.
- Chapter board drag-and-drop reordering (client state).
- Refactor screen: click a chapter in scope list → diff pane updates; Accept/Reject flips card state.
- Subtle `animate-reveal` on route mount; hover states on cards; no springy motion.

## Responsive

- Desktop-first (matches prototype at 1440). Below `lg`: sidebar becomes off-canvas via Sheet, right AI panel becomes bottom sheet in Writing Studio, chapter board becomes horizontal scroll, diff panes stack.
- Follows grid + min-w-0 + shrink-0 rules for top bar.

## Technical notes

- Pure TanStack Start routing; each route uses `createFileRoute` with head() metadata (unique title/description/og:title/og:description/og:type/twitter:card). Root gets Story Platform defaults; `/` overrides.
- Fonts loaded via `<link rel="stylesheet">` in `__root.tsx` head (not `@import` in CSS).
- No server functions, no Cloud, no auth — pure static/UX prototype ready to wire up later.
- Icons from `lucide-react`; the brand mark is a custom italic "S" glyph in an accent square (not Sparkles).

## Deliverable check

- All 13 routes render with realistic content and pass typecheck.
- Writing Studio and Story Refactor screens visually match the chosen direction.
- Light + dark modes both feel intentional.
- Sidebar navigation reaches every route; no dead links.

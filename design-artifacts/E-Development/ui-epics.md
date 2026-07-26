# UI Epics & Implementation Roadmap

This document details the **UI-specific Epics and Stories** required to transform the static, multi-page layout into the focused, single-workspace, database-backed application specified in the PRD.

---

## 1. Current UI Audit & Scope Alignment

The imported UI contains several pages that represent the "long-term vision" (e.g. world-building, timeline, consistency reports) which the PRD explicitly defers to V1.1 and beyond. To align the UI with the V1 MVP scope, we will restructure the routing and navigation as follows:

| Route | Current Function (Mock) | V1 MVP Status | Action Required |
| :--- | :--- | :--- | :--- |
| `/` | Dashboard | **Keep & Connect** | Connect to Firestore (streaks, daily goal, recent books). |
| `/books` | Shelf of Manuscripts | **Keep & Connect** | Connect to Firestore query (`books` owned by `currentUser.uid`). |
| `/books/new` | Multi-step setup wizard | **Modify & Simplify** | Replace step-wizard with a simple Name/Genre form, then redirect to `/write?bookId=...` for conversational intake. |
| `/write` | Split Editor + Chat Panel | **Keep & Core Workspace** | Build as the single workspace interface. Left: real scenes; Right: chat-first assistant + tabs for Style & Vision. |
| `/settings` | Static settings | **Keep & Simplify** | Simplify to account info, Snapshots list, and Export button. |
| `/chat` | Separate AI Chat page | **Remove / Hide** | Remove from sidebar. All chat happens within the `/write` workspace. |
| `/refactor` | Separate AI Refactor page | **Remove / Hide** | Remove from sidebar. Refactoring is handled as an inline action in the workspace chat. |
| `/characters` | Character Manager | **Remove / Hide** | Integrated into the **Vision Document** tab inside `/write`. |
| `/world` | World Building Manager | **Remove / Hide** | Integrated into the **Vision Document** tab inside `/write`. |
| `/timeline` | Timeline Manager | **Remove / Hide** | Deferred. Remove from sidebar. |
| `/notes` | Notebook page | **Remove / Hide** | Deferred. Remove from sidebar. |
| `/research` | Research assistant page | **Remove / Hide** | Deferred. Remove from sidebar. |
| `/consistency` | Consistency Audits | **Remove / Hide** | Deferred. Remove from sidebar. |
| `/publishing` | Publishing Options | **Remove / Hide** | Deferred. Remove from sidebar. |

---

## 2. Drafted UI Epics & Stories

### UI Epic 1: Access Control & Conversational Intake
Deals with signing in, starting a new book, and configuring its initial vision.

#### UI Story 1.1: Sign-In / Login Page
- **Description**: Provide a simple password login page to authenticate as one of the 3 pre-created accounts.
- **UI Element**: A centered, aesthetic card featuring input fields for email and password.
- **Behavior**: If the user is unauthenticated, redirect all routes to `/login`. Upon successful sign-in, save the Firebase Auth token and redirect to `/`.

#### UI Story 1.2: Simplified New Book Form
- **Description**: Replace the 5-step wizard with a single simplified dialog/form to start a book.
- **UI Element**: A modal or clean page containing a field for the **Book Title** and a dropdown for **Primary Genre**.
- **Behavior**: Clicking "Create Book" commits a new `Book` document to Firestore (marked `status: "intake"`) and navigates to the Writing Studio: `/write?bookId={newBookId}`.

#### UI Story 1.3: Conversational Intake Chat
- **Description**: Conduct the guided premise questions and initial Style selection inside the active Book Chat.
- **UI Element**: The right-side Chat panel starts with automated prompts from the Muse:
  - *Prompt 1*: "What is this book about? Describe your core premise."
  - *Prompt 2*: "Who is the main character and what is their goal?"
  - *Prompt 3*: "Choose a starting style (Presets list, blend, or custom instructions)."
- **Behavior**: The user types responses in the chat input. Once intake completes (or is skipped), the book status is updated to `active` in Firestore. The Muse immediately appends the `structural_note` message presenting 2–3 opening suggestions.

#### UI Story 1.4: Integrated Vision Document Tab
- **Description**: View and edit the Book's Vision Document (premises, intents, and threads) directly from a tab in the `/write` workspace.
- **UI Element**: A tab on the Writing Studio sidebar titled **Vision**. It displays:
  - *Premise & Intents*: Rich-text textareas that save changes on-blur or via auto-save.
  - *Structure Map*: A read-only list of beats (Hook, Midpoint, etc.) identified by the Muse.
  - *Narrative Threads*: An interactive list where users can click "Add Thread" (fields: surface detail, hidden meaning, subtlety selector, payoff intent), edit existing ones, or toggle their status.

---

### UI Epic 2: Integrated Writing Studio & Scene Generation
Deals with the core writing loop: writing scene descriptions, reviewing prose, and editing.

#### UI Story 2.1: Multi-Mode Generation Bar
- **Description**: Provide an input panel in the Chat to support the three different scene generation styles.
- **UI Element**: Tab selectors at the bottom of the Chat pane:
  1. **Describe** (Free-Text): A single textarea for typing a scene description.
  2. **Detail** (Structured Fields): Form fields for *Scene Goal*, *Mood*, *POV/Character*, and *Setting*.
  3. **Polish** (Draft Rewrite): A textarea for *Draft Text* and checkboxes for *Polish Aspects* (e.g., "Tighten pacing", "Raise tension").
- **Behavior**: Validate inputs client-side (e.g., ensure at least one field is filled). Clicking "Generate" disables inputs and triggers a loading state.

#### UI Story 2.2: Scene Review, Compare, & Accept Card
- **Description**: Present generated scenes as rich cards in the chat feed where they can be modified before committing.
- **UI Element**: A chat bubble containing:
  - A textarea or editable div containing the generated scene prose.
  - A bottom toolbar with: **"Accept Scene"**, **"Regenerate"**, and **"Compare"** (visible if a prior attempt exists).
- **Behavior**:
  - *Inline Edits*: Changes to the text are auto-saved to a temporary session cache.
  - *Regenerate*: Triggers a re-generation using the same inputs.
  - *Compare*: Opens a side-by-side or diff viewer showing the current generation vs the previous generation.
  - *Accept*: Appends the scene to the active chapter in the manuscript pane and locks the chat card from further modifications.

#### UI Story 2.3: Integrated Style Panel
- **Description**: A slide-out panel or tab within the chat pane to select, blend, or customize the active writing style.
- **UI Element**:
  - A list of curated, characteristic-based style presets (e.g., *Cinematic Noir*, *Twisty Mystery*).
  - Toggles to select up to two presets for blending.
  - A text input for custom instructions.
- **Behavior**: Automatically commits the updated Style parameters to the Firestore Book document, which will be read by the next scene generation call.

#### UI Story 2.4: Running Usage Indicator
- **Description**: A subtle, non-intrusive running indicator tracking API token usage.
- **UI Element**: A small, minimalist pill in the studio's bottom toolbar showing token counts (e.g., `Gemini: 14k tokens used`).
- **Behavior**: Listens to changes in the book's usage-log subcollection and updates the cumulative token counts in real-time.

---

### UI Epic 3: Coherence & Guidance Display
Deals with displaying Muse insights and configuring Narrative Threads.

#### UI Story 3.1: Muse Beats & Suggestions Display
- **Description**: Render structural beat notes and opening suggestions distinct from scene text in the chat history.
- **UI Element**: A chat card styled as a system notice (e.g., card background with a `Sparkle` icon and muted text) representing messages of type `structural_note`. It displays the Muse's recommendation and its one-line "why".
- **Behavior**: These messages are read-only and strictly advisory. They never appear in the manuscript editor on the left.

#### UI Story 3.2: Subtlety Control for Narrative Threads
- **Description**: Let the author adjust the enforcement level of narrative secrets.
- **UI Element**: A radio button group or segmented slider on each Narrative Thread card in the **Vision** tab:
  - `Invisible` (Sensory details only, never explain)
  - `Subtle` (Characters may notice, no interpretation)
  - `Explicit` (Open statement)
- **Behavior**: Saves the updated register to the Firestore thread document immediately.

---

### UI Epic 4: Snapshots & Manuscript Export
Deals with exporting work and going back to older versions.

#### UI Story 4.1: Snapshots Panel
- **Description**: A snapshots control panel in the **Settings** or as a split-pane modal in `/write`.
- **UI Element**:
  - A "Save Snapshot" input box (to name the snapshot) and button.
  - A list of existing snapshots showing name, date, and size.
  - A comparison view showing which chapters/scenes have changed since the snapshot.
  - A destructive **"Restore Snapshot"** button.
- **Behavior**:
  - *Save*: Copies active chapters/scenes and vision data to the snapshots subcollection.
  - *Restore*: Opens an `Alert-Dialog` warning: *"This action is permanent and will overwrite your current draft. Extracted facts will be rebuilt. Do you wish to proceed?"*. If confirmed, swaps active data and purges facts.

#### UI Story 4.2: Manuscript Export Action
- **Description**: Add export actions to compile the manuscript.
- **UI Element**: An "Export Book" button in Settings and the studio header, with options for **Markdown (.md)** or **Plain Text (.txt)**.
- **Behavior**: Triggers a backend export function that compiles scenes, saves them in Cloud Storage, and prompts the user to download the file.

---

## 3. Proposed Sidebar Code Changes

To implement the navigation changes and keep the UI clean, we will update the sidebar sections configuration in [`src/components/layout/AppSidebar.tsx`](file:///c:/Users/Bot/Desktop/Story/src/components/layout/AppSidebar.tsx) to:

```typescript
const sections: Array<{ heading: string; items: Item[] }> = [
  {
    heading: "Workspace",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/books", label: "My Books", icon: BookMarked },
      { to: "/write", label: "Writing Studio", icon: PenLine },
    ],
  },
  {
    heading: "Production",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
```

This hides out-of-scope sections cleanly without breaking the page files themselves.

<div align="center">

# 📖 Story — AI-Assisted Novel Writing Platform

**A private, AI-first workspace for authors to plan, draft, refactor, and publish manuscripts with a Gemini-powered co-author.**

[![React 19](https://img.shields.io/badge/React-19.2-blue?logo=react&logoColor=white)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-ff4154?logo=reactrouter&logoColor=white)](https://tanstack.com/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4.0-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-v1.3.12-black?logo=bun&logoColor=white)](https://bun.sh/)
[![Google Gemini API](https://img.shields.io/badge/Google_Gemini-3.1_Pro_|_3.6_Flash-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Firebase & GCP](https://img.shields.io/badge/GCP-Cloud_Functions_2nd_Gen-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)

</div>

---

## 🏗️ Solution Architecture Diagram

### Cloud Architecture Blueprint (GCP / Firebase)

![Story Solution Architecture Diagram](docs/assets/architecture_infographic.png)

```
+-----------------------------------------------------------------------------------------------------------------------------------------+
|                                                   STORY — SOLUTION ARCHITECTURE BLUEPRINT                                                |
+-----------------------------------------------------------------------------------------------------------------------------------------+

 [CLIENT TIER]                       [GATEWAY & COMPUTE TIER]                [PIPELINE ORCHESTRATION TIER]             [DATA & PERSISTENCE TIER]
 +---------------------------+       +-------------------------------+       +---------------------------------+       +---------------------------------+
 | Browser Client (SPA/SSR)  |       | GCP Cloud Functions (2nd Gen) |       | LangGraph.js Engine             |       | Firestore Native Mode           |
 |  - React 19               |       |  - Node.js 22 Runtime         |       |  - assembleContext (AD-3)       |       |  - books/{id}/chapters          |
 |  - TanStack Start/Router  | ----> |  - H3 Seam Handlers           | ----> |  - composePrompt                | ----> |  - books/{id}/facts (Vector)    |
 |  - Tailwind CSS v4        |       |  - Firebase Auth Validation   |       |  - generateScene                |       |  - books/{id}/vision/main       |
 |  - Writing Studio UI      |       |  - Owner Verification Check   |       |  - persistSession (AD-4)        |       |  - books/{id}/usage             |
 +---------------------------+       +-------------------------------+       +---------------------------------+       +---------------------------------+
                                                                                             |                                         ^
                                                                                             | (Event Triggers)                        | (Vector Queries)
                                                                                             v                                         |
                                                                             +---------------------------------+       +---------------------------------+
                                                                             | Async Event Background Functions|       | GCP Cloud Storage Bucket        |
                                                                             |  - extractEntities (Gemini Lite)| ----> |  - Manuscript Exports (.md/.txt)|
                                                                             |  - embedFacts (Embedding 2)     |       |  - System Backups & Assets      |
                                                                             |  - Muse Guidance (Flash Model)  |       +---------------------------------+
                                                                             +---------------------------------+
                                                                                             |
                                                                                             v
                                                                             +-------------------------------------------------------------------+
                                                                             | GOOGLE GEMINI AI SERVICES SUITE                                   |
                                                                             |  - gemini-3.1-pro-preview : Primary Scene Generation             |
                                                                             |  - gemini-3.6-flash       : Muse Beat Guidance & Suggestions       |
                                                                             |  - gemini-3.5-flash-lite  : JSON Fact & Entity Extraction         |
                                                                             |  - gemini-embedding-2     : 768-dim Vector Embeddings              |
                                                                             +-------------------------------------------------------------------+
+-----------------------------------------------------------------------------------------------------------------------------------------+
```

---

## ✨ Key Features

### ✍️ Integrated Chat-First Writing Studio
- **Three Input Modes**: Generate scenes from free-text descriptions, quick-fill structured prompts (goal, mood, POV, setting), or draft polish rewrites.
- **Inline Editing & Autosave**: Edit generated prose inline; accepted scenes append seamlessly to the active chapter.
- **Session-Cached Regenerate**: Re-run generation with updated styles or prompt parameters while reusing cached retrieval outputs server-side (AD-4).

### 🎨 Flexible Style Engine
- **Characteristic Presets**: Select from curated voice presets (e.g. *Cinematic Noir*, *Sparse Realism*).
- **Style Blending**: Combine up to two presets into a single LLM instruction call.
- **Custom Voice Guidance**: Supply custom instructions to shape tone mid-book without affecting past chapters.

### 🧠 Invisible Vector Memory & Context Assembly
- **Context-Aware Prompting**: Automatically retrieves active chapter text, preceding scenes, prior chapter summaries, and relevant facts (AD-3).
- **Vector Retrieval**: Fact extraction powered by `gemini-3.5-flash-lite` and 768-dimensional embeddings (`gemini-embedding-2`) using Firestore `findNearest` vector queries.
- **Structural Data Isolation**: Path-based subcollection containment (`books/{id}/facts`) guarantees tenant data privacy.

### 👁️ Vision Document & Narrative Threads
- **Author Intent Tracking**: Maintain theme/genre, premise, and character intents separate from manuscript text.
- **Narrative Secrets**: Manage planted details with granular subtlety registers (`invisible`, `subtle`, `explicit`) honored across all generations.

### ⚡ The Muse — Passive Beat Guidance
- **Structural Notes**: Advisory post-accept cards identifying structural beats (e.g. Inciting Incident, Midpoint, Climax) with a one-line rationale.
- **Persisted Structure Map**: Automatically updates the Vision document's Structure Map to inform future beat recommendations.

### 📸 Version Snapshots & Manuscript Export
- **Point-in-Time Snapshots**: Create named manuscript snapshots, compare chapter/scene modifications, and restore coherently with confirmation warnings.
- **Manuscript Export**: Compile ordered chapters and scenes into clean Markdown (`.md`) or Plain Text (`.txt`) files.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19 + TanStack Start + Vite v8 |
| **Routing** | TanStack Router (File-based routing) |
| **Styling & UI** | Tailwind CSS v4 + LightningCSS + Radix UI + Lucide Icons |
| **Runtime & Build** | Bun v1.3.12 + Nitro Engine (`cloudflare-module` / SSR) |
| **Backend Compute** | Google Cloud Functions (2nd Gen, Node 22, TypeScript) |
| **AI Orchestration** | LangGraph.js (Deterministic node pipelines) |
| **AI Models** | Google Gemini `gemini-3.1-pro-preview`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-embedding-2` |
| **Database & Storage** | Firestore Native Mode (Vector Search) + Cloud Storage |

---

## 🚀 Quick Start

### 1. Prerequisites
- [Bun](https://bun.sh/) `v1.3.12` or higher
- [Node.js](https://nodejs.org/) `v22.x`

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/vibecodermaster69/story-weaver-ai.git
cd story-weaver-ai

# Install dependencies
bun install
```

### 3. Environment Variables Setup
Create a `.env` file in the root directory:
```env
GOOGLE_API_KEY=your_gemini_api_key
VITE_GCP_PROJECT_ID=your_gcp_project_id
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
```

### 4. Run Development Server
```bash
bun run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### 5. Build for Production
```bash
bun run build
```

---

## 📚 Technical Documentation

For in-depth architectural specifications and developer guides, consult the [`docs/`](docs/) directory:

- 📘 [docs/overview.md](docs/overview.md) — System Vision & Tech Stack
- 🏗️ [docs/architecture.md](docs/architecture.md) — Deep-dive System Architecture & Invariants
- 🛣️ [docs/api-and-routes.md](docs/api-and-routes.md) — Route Tree & LangGraph.js Pipeline Definitions
- 🚀 [docs/setup-and-deployment.md](docs/setup-and-deployment.md) — Local Setup & Production Deployment

---

<div align="center">

*Maintained by Paige (`📚`), Technical Writer.*

</div>

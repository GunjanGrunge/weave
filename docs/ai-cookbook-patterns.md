# AI Cookbook Pattern Review

This note records which patterns from the temporary `claude-cookbooks-temp` review are useful for Story and how they should be applied. The cookbook itself is an external reference checkout and should not be vendored into this repository.

## Adopt Now

### Structured JSON Output

Source references:
- `misc/how_to_enable_json_mode.ipynb`
- `tool_use/extracting_structured_json.ipynb`

Project fit:
- Opening suggestions, Muse structure-map updates, entity extraction, and chapter summaries all need deterministic parsed payloads.
- For this project, use Gemini-native structured output instead of copying the Claude notebook implementation. The current backend already follows this direction in `functions/src/services/gemini.ts` with `responseMimeType: "application/json"` and `responseSchema`.

Implementation rule:
- Define response schemas close to the Gemini adapter.
- Parse and validate the model response before writing Firestore documents.
- Treat invalid JSON or schema mismatch as an AI failure, not as a partially successful write.

### Deterministic Pipeline Orchestration

Source references:
- `patterns/agents/orchestrator_workers.ipynb`
- `patterns/agents/async_multi_agent_orchestration.ipynb`
- `multimodal/using_sub_agents.ipynb`

Project fit:
- The architecture already uses LangGraph.js pipeline seams. Story 1.4 adds an intake pipeline for opening suggestions.
- Keep "agent" behavior bounded: deterministic graph nodes, explicit state, and typed service calls.

Implementation rule:
- Prefer Cloud Functions + LangGraph.js nodes over autonomous loops.
- Use separate pipeline nodes for generation, context assembly, extraction, Muse notes, and persistence.
- Avoid introducing Python agent SDKs or a second runtime for V1.

## Defer Until Writing Studio

### Prompt And Context Caching

Source reference:
- `misc/prompt_caching.ipynb`

Project fit:
- Useful for scene generation and regenerate flows, where the Vision Document, chapter summaries, character facts, and current manuscript context are reused across nearby requests.
- Not worth adding to the small Story 1.4 opening-suggestion path unless latency or cost proves problematic.

Implementation rule:
- Keep stable, reusable context at the beginning of prompts to benefit from provider-side implicit caching.
- Add explicit Gemini cache objects later only for large, repeated context bundles.
- Store cache metadata server-side by book/action; never send assembled context back to the browser.

### RAG And Vector Retrieval

Source references:
- `third_party/Pinecone/rag_using_pinecone.ipynb`
- `capabilities/retrieval_augmented_generation/README.md`

Project fit:
- Needed for FR-11 once manuscripts grow beyond prompt limits.
- The Pinecone cookbook is conceptually useful, but this project should start with the architecture's Firestore vector retrieval path to avoid another vendor and operational surface.

Implementation rule:
- Introduce a retrieval service seam before adding a vector provider dependency.
- Store extracted facts under `books/{bookId}/facts`.
- Query by book-scoped path, not by user-filtered global vectors.

## Do Not Vendor

Do not commit the full cookbook checkout. It is about 205 MB, includes a nested `.git` directory, and contains many notebooks, tests, images, and lockfiles unrelated to this application. Keep it as a local research artifact only.

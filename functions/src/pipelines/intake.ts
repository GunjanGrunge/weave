import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { getVisionDocument, upsertOpeningSuggestionMessage } from "../services/books.js";
import { generateOpeningSuggestions, type OpeningSuggestion } from "../services/gemini.js";

const IntakeState = Annotation.Root({
  bookId: Annotation<string>,
  apiKey: Annotation<string>,
  status: Annotation<"ok" | "failed">,
  openings: Annotation<OpeningSuggestion[]>,
});

function formatOpenings(openings: OpeningSuggestion[]): string {
  return openings
    .map((opening, index) => `${index + 1}. ${opening.text}\n   Why: ${opening.rationale}`)
    .join("\n");
}

async function openingSuggestionNode(
  state: typeof IntakeState.State,
): Promise<Partial<typeof IntakeState.State>> {
  const vision = await getVisionDocument(state.bookId);
  if (!vision) {
    return { status: "failed", openings: [] };
  }

  const { openings } = await generateOpeningSuggestions(state.bookId, vision, state.apiKey);
  await upsertOpeningSuggestionMessage(state.bookId, formatOpenings(openings));

  return { status: "ok", openings };
}

const graph = new StateGraph(IntakeState)
  .addNode("openingSuggestion", openingSuggestionNode)
  .addEdge(START, "openingSuggestion")
  .addEdge("openingSuggestion", END)
  .compile();

export async function runIntakeOpeningSuggestion(
  bookId: string,
  apiKey: string,
): Promise<{ status: "ok" | "failed"; openings: OpeningSuggestion[] }> {
  try {
    const result = await graph.invoke({ bookId, apiKey, status: "failed", openings: [] });
    return { status: result.status, openings: result.openings };
  } catch {
    return { status: "failed", openings: [] };
  }
}

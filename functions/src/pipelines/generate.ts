import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { assembleContext, type AssembledContext } from "./assembleContext.js";
import { composePrompt } from "./composePrompt.js";
import type { AIProviderKeys } from "../services/gemini.js";
import { generateScene as generateSceneCall } from "../services/gemini.js";

function firestore() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}

const GenerateState = Annotation.Root({
  bookId: Annotation<string>,
  description: Annotation<string>,
  apiKeys: Annotation<AIProviderKeys>,
  status: Annotation<"ok" | "failed">,
  assembledContext: Annotation<AssembledContext | undefined>,
  prompt: Annotation<string | undefined>,
  text: Annotation<string | undefined>,
  provider: Annotation<"openai" | "gemini" | undefined>,
  model: Annotation<string | undefined>,
  sessionId: Annotation<string | undefined>,
});

type GenerateStateValue = typeof GenerateState.State;

async function assembleContextNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  const assembledContext = await assembleContext(state.bookId);
  return { assembledContext };
}

async function composePromptNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (!state.assembledContext) {
    console.error("generate/composePrompt: no assembled context", { bookId: state.bookId });
    return { status: "failed" };
  }
  const composed = await composePrompt(state.bookId, state.assembledContext, state.description);
  if (!composed) {
    console.error("generate/composePrompt: composePrompt returned undefined (missing book or vision)", {
      bookId: state.bookId,
    });
    return { status: "failed" };
  }
  return { prompt: composed.prompt };
}

async function generateSceneNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (!state.prompt) {
    return { status: "failed" };
  }
  try {
    const result = await generateSceneCall(state.bookId, state.prompt, state.apiKeys);
    return { text: result.text, provider: result.provider, model: result.model, status: "ok" };
  } catch (error) {
    console.error("generate/generateScene: model call failed", { bookId: state.bookId, error });
    return { status: "failed" };
  }
}

/**
 * A session-persistence failure must not discard an already-generated,
 * already-billed scene: the node logs the error and omits `sessionId`
 * rather than flipping `status` to `failed` (see `runGenerate`'s success
 * check, which treats a missing `sessionId` as a degraded-but-real success).
 */
async function persistSessionNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (state.status !== "ok" || !state.assembledContext || !state.prompt) {
    return {};
  }

  try {
    const sessionRef = firestore()
      .collection("books")
      .doc(state.bookId)
      .collection("sessions")
      .doc();

    await sessionRef.set({
      bookId: state.bookId,
      chapterId: state.assembledContext.chapterId ?? null,
      assembledContext: { priorScenesText: state.assembledContext.priorScenesText },
      composedPrompt: state.prompt,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { sessionId: sessionRef.id };
  } catch (error) {
    console.error("generate/persistSession: session write failed", { bookId: state.bookId, error });
    return {};
  }
}

const graph = new StateGraph(GenerateState)
  .addNode("assembleContext", assembleContextNode)
  .addNode("composePrompt", composePromptNode)
  .addNode("generateScene", generateSceneNode)
  .addNode("persistSession", persistSessionNode)
  .addEdge(START, "assembleContext")
  .addEdge("assembleContext", "composePrompt")
  .addEdge("composePrompt", "generateScene")
  .addEdge("generateScene", "persistSession")
  .addEdge("persistSession", END)
  .compile();

export type RunGenerateResult =
  | { status: "ok"; text: string; provider: "openai" | "gemini"; model: string; sessionId: string }
  | { status: "failed" };

export async function runGenerate(
  bookId: string,
  description: string,
  apiKeys: AIProviderKeys,
): Promise<RunGenerateResult> {
  const result = await graph.invoke({
    bookId,
    description,
    apiKeys,
    status: "failed",
    assembledContext: undefined,
    prompt: undefined,
    text: undefined,
    provider: undefined,
    model: undefined,
    sessionId: undefined,
  });

  // A missing sessionId (persistSession failed) does not discard an
  // already-generated, already-billed scene — the generation itself is
  // what matters to the caller; regenerate simply won't have a session
  // to reuse for this one request.
  if (result.status === "ok" && result.text && result.provider && result.model) {
    return {
      status: "ok",
      text: result.text,
      provider: result.provider,
      model: result.model,
      sessionId: result.sessionId ?? "",
    };
  }

  return { status: "failed" };
}

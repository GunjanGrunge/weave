import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { assembleContext, type AssembledContext } from "./assembleContext.js";
import { composePrompt } from "./composePrompt.js";
import { getBook, getMessages } from "../services/books.js";
import type { AIProviderKeys } from "../services/gemini.js";
import { generateScene as generateSceneCall, reviseSceneDraft } from "../services/gemini.js";
import { getCanonicalRoster } from "../services/storyBible.js";
import {
  claimInitialGeneration,
  claimRegeneration,
  commitRegeneration,
  failInitialGeneration,
  failRegeneration,
  persistGeneratedCandidate,
  type CandidateResult,
} from "../services/scenes.js";
import type { GenerationSession, SceneAttempt } from "../types/generationSession.js";
import type { SceneInput } from "../types/sceneInput.js";
import type { SceneUsageTask } from "../types/usage.js";

export type RunGenerateResult =
  | ({ status: "ok"; actionable: boolean } & CandidateResult)
  | {
      status: "ok";
      actionable: false;
      sessionId: "";
      messageId: "";
      text: string;
      revision: 0;
      provider: "openai" | "gemini";
      model: string;
    }
  | { status: "in-progress" }
  | { status: "failed" };

const GenerateState = Annotation.Root({
  bookId: Annotation<string>,
  input: Annotation<SceneInput>,
  apiKeys: Annotation<AIProviderKeys>,
  usageTask: Annotation<SceneUsageTask>,
  status: Annotation<"ok" | "failed">,
  assembledContext: Annotation<AssembledContext | undefined>,
  prompt: Annotation<string | undefined>,
  candidate: Annotation<SceneAttempt | undefined>,
});

type GenerateStateValue = typeof GenerateState.State;

function recentPlanningConversation(
  messages: Awaited<ReturnType<typeof getMessages>>,
): string {
  const turns = messages
    .filter((message) => message.type === "user" || message.type === "structural_note")
    .slice(-24)
    .map((message) => `${message.type === "user" ? "AUTHOR" : "MUSE"}: ${message.text.slice(0, 1_200)}`);
  return turns.join("\n").slice(-20_000);
}

async function assembleNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (state.assembledContext) {
    return {};
  }
  return {
    assembledContext: await assembleContext(state.bookId, state.input, state.apiKeys),
  };
}

async function composeNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (!state.assembledContext) {
    return { status: "failed" };
  }
  const planningConversation = recentPlanningConversation(await getMessages(state.bookId));
  const composed = planningConversation
    ? await composePrompt(state.bookId, state.assembledContext, state.input, planningConversation)
    : await composePrompt(state.bookId, state.assembledContext, state.input);
  if (!composed) {
    console.error("generate/composePrompt: missing book or vision", {
      bookId: state.bookId,
    });
    return { status: "failed" };
  }
  return { prompt: composed.prompt };
}

async function generateNode(state: GenerateStateValue): Promise<Partial<GenerateStateValue>> {
  if (!state.prompt) {
    return { status: "failed" };
  }
  try {
    const generated = await generateSceneCall(
      state.bookId,
      state.prompt,
      state.apiKeys,
      state.usageTask,
    );
    let final = generated;
    if (state.input.preferences?.quality === "deep" && state.input.mode !== "polish") {
      try {
        final = await reviseSceneDraft(state.bookId, state.prompt, generated.text, state.apiKeys);
      } catch (error) {
        console.error("generate/deep-revision: using successful first draft", {
          bookId: state.bookId,
          error,
        });
      }
    }
    return {
      candidate: {
        text: final.text,
        provider: final.provider,
        model: final.model,
      },
      status: "ok",
    };
  } catch (error) {
    console.error("generate/model: provider call failed", { bookId: state.bookId, error });
    return { status: "failed" };
  }
}

const graph = new StateGraph(GenerateState)
  .addNode("assembleContext", assembleNode)
  .addNode("composePrompt", composeNode)
  .addNode("generateScene", generateNode)
  .addEdge(START, "assembleContext")
  .addEdge("assembleContext", "composePrompt")
  .addEdge("composePrompt", "generateScene")
  .addEdge("generateScene", END)
  .compile();

async function executeGeneration(
  bookId: string,
  input: SceneInput,
  apiKeys: AIProviderKeys,
  usageTask: SceneUsageTask,
  assembledContext?: AssembledContext,
): Promise<
  | {
      candidate: SceneAttempt;
      assembledContext: AssembledContext;
    }
  | undefined
> {
  const result = await graph.invoke({
    bookId,
    input,
    apiKeys,
    usageTask,
    status: "failed",
    assembledContext,
    prompt: undefined,
    candidate: undefined,
  });
  return result.status === "ok" && result.candidate && result.assembledContext
    ? { candidate: result.candidate, assembledContext: result.assembledContext }
    : undefined;
}

export async function runGenerate(
  bookId: string,
  input: SceneInput,
  apiKeys: AIProviderKeys,
  operation: { idempotencyKey: string; userMessage: string } = {
    idempotencyKey: randomUUID(),
    userMessage: "",
  },
): Promise<RunGenerateResult> {
  const claim = await claimInitialGeneration(bookId, operation.idempotencyKey);
  if (claim.status === "in-progress") {
    return { status: "in-progress" };
  }
  if (claim.status === "completed") {
    return { status: "ok", actionable: true, ...claim.result };
  }

  let generated: Awaited<ReturnType<typeof executeGeneration>>;
  try {
    generated = await executeGeneration(bookId, input, apiKeys, "generate");
  } catch (error) {
    console.error("generate/context: context assembly failed", { bookId, error });
    await failInitialGeneration(bookId, operation.idempotencyKey, claim.attemptToken);
    return { status: "failed" };
  }
  if (!generated) {
    await failInitialGeneration(bookId, operation.idempotencyKey, claim.attemptToken);
    return { status: "failed" };
  }

  try {
    const persisted = await persistGeneratedCandidate({
      bookId,
      idempotencyKey: operation.idempotencyKey,
      attemptToken: claim.attemptToken,
      sceneInput: input,
      userMessage: operation.userMessage,
      assembledContext: generated.assembledContext,
      candidate: generated.candidate,
    });
    return { status: "ok", actionable: true, ...persisted };
  } catch (error) {
    // The model call has succeeded and may be billed. Preserve its prose even
    // if the durable review session cannot be committed.
    console.error("generate/persist: generated candidate could not be persisted", {
      bookId,
      error,
    });
    return {
      status: "ok",
      actionable: false,
      sessionId: "",
      messageId: "",
      text: generated.candidate.text,
      revision: 0,
      provider: generated.candidate.provider,
      model: generated.candidate.model,
    };
  }
}

async function cachedContext(
  bookId: string,
  session: GenerationSession,
): Promise<AssembledContext> {
  const canonicalRoster = await getCanonicalRoster(bookId).catch(() => ({
    text: session.assembledContext.canonicalRosterText ?? "",
    state: session.assembledContext.storyBibleState ?? "stale",
    revision: session.storyBibleRevision ?? session.assembledContext.storyBibleRevision ?? 0,
    characterCount: 0,
  }));
  return {
    chapterId: session.chapterId ?? undefined,
    priorScenesText: session.assembledContext.priorScenesText,
    canonicalRosterText: canonicalRoster.text,
    storyBibleState: canonicalRoster.state,
    storyBibleRevision: canonicalRoster.revision,
    manuscriptRevision: session.manuscriptRevision,
  };
}

export async function runRegenerate(
  bookId: string,
  sessionId: string,
  expectedRevision: number,
  idempotencyKey: string,
  apiKeys: AIProviderKeys,
): Promise<RunGenerateResult> {
  const claim = await claimRegeneration(bookId, sessionId, idempotencyKey, expectedRevision);
  if (claim.status === "in-progress") {
    return { status: "in-progress" };
  }
  if (claim.status === "completed") {
    return { status: "ok", actionable: true, ...claim.result };
  }

  const book = await getBook(bookId);
  if (!book) {
    await failRegeneration(bookId, sessionId, claim.attemptToken);
    return { status: "failed" };
  }
  const currentManuscriptRevision =
    typeof book.manuscriptRevision === "number" ? book.manuscriptRevision : 0;
  let generated: Awaited<ReturnType<typeof executeGeneration>>;
  try {
    const reusableContext =
      currentManuscriptRevision === claim.session.manuscriptRevision
        ? await cachedContext(bookId, claim.session)
        : undefined;
    generated = await executeGeneration(
      bookId,
      claim.session.input,
      apiKeys,
      "regenerate",
      reusableContext,
    );
  } catch (error) {
    console.error("regenerate/context: context assembly failed", { bookId, error });
    await failRegeneration(bookId, sessionId, claim.attemptToken);
    return { status: "failed" };
  }
  if (!generated) {
    await failRegeneration(bookId, sessionId, claim.attemptToken);
    return { status: "failed" };
  }

  try {
    const committed = await commitRegeneration({
      bookId,
      sessionId,
      attemptToken: claim.attemptToken,
      expectedRevision,
      assembledContext: generated.assembledContext,
      candidate: generated.candidate,
    });
    return { status: "ok", actionable: true, ...committed };
  } catch (error) {
    console.error("regenerate/commit: candidate was not committed", {
      bookId,
      sessionId,
      error,
    });
    return { status: "failed" };
  }
}

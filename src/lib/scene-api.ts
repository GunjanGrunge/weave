import { authenticatedFetch } from "./api";

export type SceneAttempt = {
  text: string;
  provider: "openai" | "gemini";
  model: string;
};

export type ChatMessage = {
  id?: string;
  type: "user" | "assistant_scene" | "structural_note" | "system";
  text: string;
  order: number;
  sessionId?: string;
  revision?: number;
  status?: "active" | "accepted";
  provider?: "openai" | "gemini";
  model?: string;
  previousAttempt?: SceneAttempt;
  acceptedSceneId?: string;
};

export type SceneCandidate = {
  sessionId: string;
  messageId: string;
  text: string;
  revision: number;
  status: "active" | "accepted";
  provider: "openai" | "gemini";
  model: string;
  previousAttempt?: SceneAttempt;
  acceptedSceneId?: string;
  acceptedSceneOrder?: number;
};

export type GeneratedScene = SceneCandidate & { actionable: true };
export type DegradedGeneratedScene = {
  sessionId: "";
  messageId: "";
  text: string;
  revision: 0;
  provider: "openai" | "gemini";
  model: string;
  actionable: false;
};

export class SceneApiError extends Error {
  constructor(
    message: string,
    public readonly code = "request-failed",
  ) {
    super(message);
    this.name = "SceneApiError";
  }
}

export class SceneConflictError extends SceneApiError {
  constructor(
    message: string,
    public readonly canonical: SceneCandidate,
  ) {
    super(message, "stale-revision");
    this.name = "SceneConflictError";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function provider(value: unknown): "openai" | "gemini" | undefined {
  return value === "openai" || value === "gemini" ? value : undefined;
}

function parseAttempt(value: unknown): SceneAttempt | undefined {
  const item = record(value);
  const parsedProvider = provider(item?.provider);
  return item && typeof item.text === "string" && parsedProvider && typeof item.model === "string"
    ? { text: item.text, provider: parsedProvider, model: item.model }
    : undefined;
}

export function parseCandidate(value: unknown): SceneCandidate | undefined {
  const item = record(value);
  const parsedProvider = provider(item?.provider);
  if (
    !item ||
    typeof item.sessionId !== "string" ||
    !item.sessionId ||
    typeof item.messageId !== "string" ||
    !item.messageId ||
    typeof item.text !== "string" ||
    !Number.isSafeInteger(item.revision) ||
    (item.revision as number) < 0 ||
    (item.status !== "active" && item.status !== "accepted") ||
    !parsedProvider ||
    typeof item.model !== "string"
  ) {
    return undefined;
  }
  const previousAttempt =
    item.previousAttempt === undefined ? undefined : parseAttempt(item.previousAttempt);
  if (item.previousAttempt !== undefined && !previousAttempt) {
    return undefined;
  }
  if (
    item.acceptedSceneOrder !== undefined &&
    (!Number.isSafeInteger(item.acceptedSceneOrder) || (item.acceptedSceneOrder as number) < 0)
  ) {
    return undefined;
  }
  return {
    sessionId: item.sessionId,
    messageId: item.messageId,
    text: item.text,
    revision: item.revision as number,
    status: item.status,
    provider: parsedProvider,
    model: item.model,
    ...(previousAttempt ? { previousAttempt } : {}),
    ...(typeof item.acceptedSceneId === "string" ? { acceptedSceneId: item.acceptedSceneId } : {}),
    ...(typeof item.acceptedSceneOrder === "number"
      ? { acceptedSceneOrder: item.acceptedSceneOrder }
      : {}),
  };
}

export function parseChatMessages(value: unknown): ChatMessage[] | undefined {
  const envelope = record(value);
  if (!Array.isArray(envelope?.messages)) {
    return undefined;
  }
  const parsed: ChatMessage[] = [];
  for (const valueMessage of envelope.messages) {
    const item = record(valueMessage);
    if (
      !item ||
      !["user", "assistant_scene", "structural_note", "system"].includes(item.type as string) ||
      typeof item.text !== "string" ||
      !Number.isSafeInteger(item.order)
    ) {
      return undefined;
    }
    const message: ChatMessage = {
      type: item.type as ChatMessage["type"],
      text: item.text,
      order: item.order as number,
      ...(typeof item.id === "string" ? { id: item.id } : {}),
    };
    const isActionable = typeof item.sessionId === "string";
    if (isActionable) {
      const parsedProvider = provider(item.provider);
      const previousAttempt =
        item.previousAttempt === undefined ? undefined : parseAttempt(item.previousAttempt);
      if (
        message.type !== "assistant_scene" ||
        !message.id ||
        !Number.isSafeInteger(item.revision) ||
        (item.status !== "active" && item.status !== "accepted") ||
        !parsedProvider ||
        typeof item.model !== "string" ||
        (item.previousAttempt !== undefined && !previousAttempt)
      ) {
        return undefined;
      }
      Object.assign(message, {
        sessionId: item.sessionId,
        revision: item.revision,
        status: item.status,
        provider: parsedProvider,
        model: item.model,
        ...(previousAttempt ? { previousAttempt } : {}),
        ...(typeof item.acceptedSceneId === "string"
          ? { acceptedSceneId: item.acceptedSceneId }
          : {}),
      });
    }
    parsed.push(message);
  }
  return parsed;
}

export function parseGeneratedScene(
  value: unknown,
): GeneratedScene | DegradedGeneratedScene | undefined {
  const item = record(value);
  if (item?.actionable === true) {
    const candidate = parseCandidate(item);
    return candidate ? { ...candidate, actionable: true } : undefined;
  }
  const parsedProvider = provider(item?.provider);
  const isExplicitDegraded =
    item?.actionable === false && item.sessionId === "" && item.messageId === "";
  const isLegacyReadOnly =
    item?.actionable === undefined &&
    typeof item.sessionId === "string" &&
    item.messageId === undefined;
  return (isExplicitDegraded || isLegacyReadOnly) &&
    typeof item.text === "string" &&
    (item.revision === 0 || item.revision === undefined) &&
    parsedProvider &&
    typeof item.model === "string"
    ? {
        sessionId: "",
        messageId: "",
        text: item.text,
        revision: 0,
        provider: parsedProvider,
        model: item.model,
        actionable: false,
      }
    : undefined;
}

async function post(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await authenticatedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SceneApiError("The server returned an unreadable response.");
  }
  if (response.status === 409) {
    const conflict = record(body);
    const canonical = parseCandidate(conflict?.canonical);
    if (!canonical) {
      throw new SceneApiError("The server returned an invalid conflict response.");
    }
    throw new SceneConflictError(
      typeof conflict?.message === "string" ? conflict.message : "A newer saved version exists.",
      canonical,
    );
  }
  if (!response.ok) {
    const error = record(body);
    throw new SceneApiError(
      typeof error?.message === "string" ? error.message : "The request failed.",
      typeof error?.code === "string" ? error.code : "request-failed",
    );
  }
  return body;
}

export async function saveGeneratedScene(
  bookId: string,
  candidate: Pick<SceneCandidate, "sessionId" | "revision" | "text">,
): Promise<SceneCandidate> {
  const parsed = parseCandidate(
    await post("/saveGeneratedScene", {
      bookId,
      sessionId: candidate.sessionId,
      expectedRevision: candidate.revision,
      text: candidate.text,
    }),
  );
  if (!parsed) {
    throw new SceneApiError("The server returned invalid saved scene data.");
  }
  return parsed;
}

export async function regenerateScene(
  bookId: string,
  candidate: Pick<SceneCandidate, "sessionId" | "revision">,
  idempotencyKey: string,
): Promise<SceneCandidate> {
  const parsed = parseCandidate(
    await post("/regenerateScene", {
      bookId,
      sessionId: candidate.sessionId,
      expectedRevision: candidate.revision,
      idempotencyKey,
    }),
  );
  if (!parsed) {
    throw new SceneApiError("The server returned invalid regenerated scene data.");
  }
  return parsed;
}

export async function revertGeneratedScene(
  bookId: string,
  candidate: Pick<SceneCandidate, "sessionId" | "revision">,
): Promise<SceneCandidate> {
  const parsed = parseCandidate(
    await post("/revertGeneratedScene", {
      bookId,
      sessionId: candidate.sessionId,
      expectedRevision: candidate.revision,
    }),
  );
  if (!parsed) {
    throw new SceneApiError("The server returned invalid restored scene data.");
  }
  return parsed;
}

export async function acceptScene(
  bookId: string,
  candidate: Pick<SceneCandidate, "sessionId" | "revision">,
  idempotencyKey: string,
): Promise<SceneCandidate> {
  const body = record(
    await post("/acceptScene", {
      bookId,
      sessionId: candidate.sessionId,
      expectedRevision: candidate.revision,
      idempotencyKey,
    }),
  );
  const parsed = parseCandidate(body?.candidate);
  if (
    !parsed ||
    parsed.status !== "accepted" ||
    typeof body?.sceneId !== "string" ||
    !Number.isSafeInteger(body.order)
  ) {
    throw new SceneApiError("The server returned invalid accepted scene data.");
  }
  return parsed;
}

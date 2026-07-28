import { describe, expect, it } from "vitest";

import { parseCandidate, parseChatMessages, parseGeneratedScene } from "./scene-api";

const candidate = {
  sessionId: "session-1",
  messageId: "message-1",
  text: "Scene.",
  revision: 1,
  status: "active",
  provider: "openai",
  model: "gpt-test",
};

describe("scene API runtime validation", () => {
  it("accepts actionable and legacy messages without exposing session context", () => {
    expect(
      parseChatMessages({
        messages: [
          { id: "legacy", type: "assistant_scene", text: "Legacy.", order: 0 },
          {
            id: "message-1",
            type: "assistant_scene",
            text: "Scene.",
            order: 1,
            sessionId: "session-1",
            revision: 1,
            status: "active",
            provider: "openai",
            model: "gpt-test",
          },
        ],
      }),
    ).toHaveLength(2);
  });

  it("rejects partial actionable metadata and malformed previous attempts", () => {
    expect(
      parseChatMessages({
        messages: [
          {
            id: "message-1",
            type: "assistant_scene",
            text: "Scene.",
            order: 1,
            sessionId: "session-1",
          },
        ],
      }),
    ).toBeUndefined();
    expect(parseCandidate({ ...candidate, previousAttempt: { text: "Prior." } })).toBeUndefined();
  });

  it("rejects invalid candidate revisions and providers", () => {
    expect(parseCandidate({ ...candidate, revision: -1 })).toBeUndefined();
    expect(parseCandidate({ ...candidate, provider: "unknown" })).toBeUndefined();
  });

  it("validates actionable generation and treats the old response as read-only", () => {
    expect(parseGeneratedScene({ ...candidate, actionable: true })).toMatchObject({
      actionable: true,
      sessionId: "session-1",
    });
    expect(
      parseGeneratedScene({
        sessionId: "legacy-session",
        text: "Legacy generated prose.",
        provider: "openai",
        model: "gpt-test",
      }),
    ).toEqual({
      sessionId: "",
      messageId: "",
      text: "Legacy generated prose.",
      revision: 0,
      provider: "openai",
      model: "gpt-test",
      actionable: false,
    });
  });
});

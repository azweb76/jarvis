import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_CONTENT_LENGTH,
  MessagePolicyError,
  assertValidAgentMessage
} from "../src/core/message-guardrails.js";

const agents = ["greeter", "memory", "planner"];

describe("assertValidAgentMessage", () => {
  it("accepts a well-formed message", () => {
    const guarded = assertValidAgentMessage("planner", "memory", "  remember this  ", agents, {
      priority: "high",
      correlationId: "corr-1",
      taskId: "task-9",
      ttlMs: 60_000
    });
    expect(guarded.content).toBe("remember this");
    expect(guarded.options.priority).toBe("high");
    expect(guarded.options.correlationId).toBe("corr-1");
  });

  it("rejects unknown agents and oversized payloads", () => {
    expect(() => assertValidAgentMessage("ghost", "memory", "hi", agents)).toThrow(MessagePolicyError);
    expect(() =>
      assertValidAgentMessage("planner", "memory", "x".repeat(MAX_MESSAGE_CONTENT_LENGTH + 1), agents)
    ).toThrow(/exceeds/);
  });

  it("strips control characters and rejects empty content", () => {
    expect(() => assertValidAgentMessage("planner", "memory", "\u0000\n  ", agents)).toThrow(/required/);
  });
});

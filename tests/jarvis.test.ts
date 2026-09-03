import { describe, expect, it } from "vitest";
import { JarvisRuntime } from "../src/core/jarvis.js";
import type { ClaudeClient } from "../src/core/types.js";

class FakeClaudeClient implements ClaudeClient {
  async complete(_systemPrompt: string, userPrompt: string): Promise<string> {
    if (userPrompt.includes("Known user name: Dan")) {
      return "Hi Dan! Great to hear from you.";
    }
    return "Hello there!";
  }
}

describe("JarvisRuntime", () => {
  it("stores user name in memory and uses it in chat", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient());
    await runtime.chat("My name is Dan");
    const reply = await runtime.chat("hello");
    expect(reply.text).toContain("Dan");
    expect(runtime.getState().memory["user.name"]).toBe("Dan");
  });

  it("assigns tasks to agents", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient());
    const reply = await runtime.assignTask("planner", {
      title: "Sprint focus",
      prompt: "Create first steps"
    });
    expect(reply.agentId).toBe("planner");
    expect(reply.text).toContain("Plan draft");
  });
});

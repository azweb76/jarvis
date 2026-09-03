import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JarvisRuntime } from "../src/core/jarvis.js";
import type { ClaudeClient } from "../src/core/types.js";

class FakeClaudeClient implements ClaudeClient {
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    if (systemPrompt.includes("Jarvis planner") || systemPrompt.includes("Start with 'Plan draft:'")) {
      return "Plan draft: 1) understand request 2) split into implementation tasks 3) execute and verify.";
    }
    if (userPrompt.includes("Known user name: Dan")) {
      return "Hi Dan! Great to hear from you.";
    }
    return "Hello there!";
  }
}

const createDbPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
  return path.join(dir, "memory.db");
};

describe("JarvisRuntime", () => {
  it("persists user memory in sqlite and uses it in chat", async () => {
    const dbPath = createDbPath();
    const runtimeA = new JarvisRuntime(new FakeClaudeClient(), dbPath);
    await runtimeA.chat("My name is Dan");

    const runtimeB = new JarvisRuntime(new FakeClaudeClient(), dbPath);
    const reply = await runtimeB.chat("hello");

    expect(reply.text).toContain("Dan");
    expect(runtimeB.getState().memory["user.name"]).toBe("Dan");
  });

  it("assigns tasks to agents", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    const reply = await runtime.assignTask("planner", {
      title: "Sprint focus",
      prompt: "Create first steps"
    });
    expect(reply.agentId).toBe("planner");
    expect(reply.text).toContain("Plan draft");
  });

  it("tracks structured agent inbox/outbox messages", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    runtime.sendAgentMessage("planner", "memory", "low priority", {
      priority: "low",
      correlationId: "corr-1",
      taskId: "task-7"
    });
    runtime.sendAgentMessage("greeter", "memory", "high priority", {
      priority: "high",
      correlationId: "corr-2"
    });

    const memoryMessages = runtime.getAgentMessages("memory").inbox;
    expect(memoryMessages.length).toBe(2);
    expect(memoryMessages[0].content).toContain("high priority");
    expect(memoryMessages[0].priority).toBe("high");
    expect(memoryMessages[0].correlationId).toBe("corr-2");
    expect(memoryMessages[1].taskId).toBe("task-7");
  });

  it("filters expired inbox messages by ttl", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    runtime.sendAgentMessage("planner", "memory", "expires soon", { ttlMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const inbox = runtime.getAgentMessages("memory").inbox;
    expect(inbox.length).toBe(0);
  });
});

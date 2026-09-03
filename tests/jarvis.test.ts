import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("tracks agent inbox and outbox messages", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    await runtime.chat("Hello Jarvis");
    const greeterMessages = runtime.getAgentMessages("greeter");
    const memoryMessages = runtime.getAgentMessages("memory");

    expect(greeterMessages.outbox.length).toBeGreaterThan(0);
    expect(memoryMessages.inbox.length).toBeGreaterThan(0);
  });
});

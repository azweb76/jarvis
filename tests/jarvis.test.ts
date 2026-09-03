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

  it("persists skill notes in sqlite across runtimes", async () => {
    const dbPath = createDbPath();
    const runtimeA = new JarvisRuntime(new FakeClaudeClient(), dbPath);
    await runtimeA.chat("My name is Dan");

    const runtimeB = new JarvisRuntime(new FakeClaudeClient(), dbPath);
    expect(runtimeB.getState().skills.greeter).toContain("Users like warm and concise responses.");
  });

  it("exports and restores memory and skills from a backup", async () => {
    const runtimeA = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    await runtimeA.chat("My name is Dan");
    const backup = runtimeA.exportBackup();

    const runtimeB = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    runtimeB.importBackup(backup);

    expect(runtimeB.getState().memory["user.name"]).toBe("Dan");
    expect(runtimeB.getState().skills.greeter?.length).toBeGreaterThan(0);
  });

  it("writes a local backup file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
    const backupDir = path.join(dir, "backups");
    const runtime = new JarvisRuntime(new FakeClaudeClient(), path.join(dir, "memory.db"), backupDir);
    await runtime.chat("My name is Dan");
    const result = runtime.writeLocalBackup();

    expect(fs.existsSync(result.path)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(result.path, "utf8")) as { memory: Record<string, string> };
    expect(saved.memory["user.name"]).toBe("Dan");
  });

  it("rejects inter-agent messages that violate guardrails", async () => {
    const runtime = new JarvisRuntime(new FakeClaudeClient(), createDbPath());
    expect(() => runtime.sendAgentMessage("planner", "unknown", "note")).toThrow(/Unknown agent/);
    expect(() => runtime.sendAgentMessage("planner", "memory", "x".repeat(4001))).toThrow(/exceeds/);
    expect(() =>
      runtime.sendAgentMessage("planner", "memory", "ok", { priority: "urgent" as "high" })
    ).toThrow(/priority/);
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

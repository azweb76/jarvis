import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { JarvisRuntime } from "../src/core/jarvis.js";
import { parseWorktreePorcelain } from "../src/core/git.js";
import { parseProjectIntent } from "../src/core/project-intent.js";
import { applyWorktreeFiles, extractJsonObject } from "../src/core/project-files.js";
import { detectVerifyCommand } from "../src/core/project-workshop.js";
import type { ClaudeClient } from "../src/core/types.js";

class WorkshopClaudeClient implements ClaudeClient {
  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    if (systemPrompt.includes("Jarvis brainstorm")) {
      return "Options: 1) tiny README note 2) larger rewrite. Recommend 1. Risk: scope creep.";
    }
    if (systemPrompt.includes("Jarvis planner") || systemPrompt.includes("Start with 'Plan draft:'")) {
      return "Plan draft: 1) implementer adds README note 2) verifier runs tests.";
    }
    if (systemPrompt.includes("Jarvis implementer")) {
      return JSON.stringify({
        advice: "Keep the change tiny.",
        summary: "Added workshop note to README.",
        commitMessage: "docs: note jarvis workshop",
        files: [
          {
            path: "README.md",
            action: "write",
            content: "# Sample\n\nJarvis workshop was here.\n"
          }
        ]
      });
    }
    if (systemPrompt.includes("Jarvis verifier")) {
      const failed = /Exit: (?!0)\d+/.test(userPrompt);
      return JSON.stringify({
        passed: !failed,
        notes: failed ? "Tests failed; loop." : "Looks good.",
        loop: failed
      });
    }
    if (userPrompt.includes("Known user name: Dan")) {
      return "Hi Dan! Ready to work the project.";
    }
    return "Hello there!";
  }
}

const tempDirs: string[] = [];

const createDbPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-test-"));
  tempDirs.push(dir);
  return path.join(dir, "memory.db");
};

const createProjectRepo = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-repo-"));
  tempDirs.push(dir);
  run(dir, ["git", "init"]);
  run(dir, ["git", "config", "user.email", "jarvis@example.com"]);
  run(dir, ["git", "config", "user.name", "Jarvis Test"]);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "sample", private: true, scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2)
  );
  fs.writeFileSync(path.join(dir, "README.md"), "# Sample\n");
  run(dir, ["git", "add", "-A"]);
  run(dir, ["git", "commit", "-m", "chore: init"]);
  return dir;
};

const run = (cwd: string, args: string[]) => {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || args.join(" "));
  }
};

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("project helpers", () => {
  it("parses worktree porcelain", () => {
    const parsed = parseWorktreePorcelain(
      [
        "worktree /tmp/a",
        "HEAD abc",
        "branch refs/heads/main",
        "",
        "worktree /tmp/b",
        "HEAD def",
        "detached"
      ].join("\n")
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].branch).toBe("main");
    expect(parsed[1].branch).toBeNull();
  });

  it("parses project intents", () => {
    expect(parseProjectIntent("help me work on /tmp/demo: add dark mode").action).toBe("start");
    expect(parseProjectIntent("project status", "/tmp/demo").action).toBe("status");
    expect(parseProjectIntent("keep going", "/tmp/demo").action).toBe("advance");
  });

  it("extracts json and applies safe worktree files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-files-"));
    tempDirs.push(dir);
    const json = extractJsonObject('```json\n{"files":[{"path":"a.txt","content":"hi"}]}\n```');
    expect(json?.files).toBeTruthy();
    const applied = applyWorktreeFiles(dir, [{ path: "notes/a.txt", content: "hi" }]);
    expect(applied[0].path).toBe(path.join("notes", "a.txt"));
    expect(fs.readFileSync(path.join(dir, "notes", "a.txt"), "utf8")).toBe("hi");
    expect(() => applyWorktreeFiles(dir, [{ path: "../escape.txt", content: "nope" }])).toThrow(
      /outside worktree/
    );
  });

  it("detects verify command from package manager", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-pkg-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "");
    expect(detectVerifyCommand(dir)).toEqual(["pnpm", "test"]);
  });
});

describe("JarvisRuntime project workshop", () => {
  it("starts a session with worktree, brainstorm, and plan", async () => {
    const repo = createProjectRepo();
    const runtime = new JarvisRuntime(new WorkshopClaudeClient(), createDbPath(), createDbPath(), createDbPath());
    const session = await runtime.startProject({
      repoPath: repo,
      goal: "Add a short README note"
    });

    expect(session.phase).toBe("plan");
    expect(session.advice).toContain("Recommend");
    expect(session.plan).toContain("Plan draft");
    expect(fs.existsSync(session.worktreePath)).toBe(true);
    expect(session.branch.startsWith("jarvis/")).toBe(true);

    const worktrees = await runtime.listProjectWorktrees(repo);
    expect(worktrees.some((tree) => tree.path === session.worktreePath)).toBe(true);
  });

  it("implements in the worktree, verifies, and can commit", async () => {
    const repo = createProjectRepo();
    const runtime = new JarvisRuntime(new WorkshopClaudeClient(), createDbPath(), createDbPath(), createDbPath());
    const started = await runtime.startProject({
      repoPath: repo,
      goal: "Add a short README note"
    });

    const implemented = await runtime.advanceProject(started.id);
    expect(implemented.phase).toBe("implement");
    expect(implemented.appliedFiles.some((file) => file.path === "README.md")).toBe(true);
    expect(fs.readFileSync(path.join(implemented.worktreePath, "README.md"), "utf8")).toContain(
      "Jarvis workshop"
    );

    const verified = await runtime.advanceProject(implemented.id);
    expect(verified.phase).toBe("verify");
    expect(verified.verification?.passed).toBe(true);

    const done = await runtime.advanceProject(verified.id);
    expect(done.phase).toBe("done");

    const committed = await runtime.commitProject(done.id);
    expect(committed.result).toMatch(/Committed|Nothing to commit/);
  });

  it("includes workshop summary when chat starts a project", async () => {
    const repo = createProjectRepo();
    const runtime = new JarvisRuntime(new WorkshopClaudeClient(), createDbPath(), createDbPath(), createDbPath());
    await runtime.chat("My name is Dan");
    const reply = await runtime.chat(`help me work on ${repo}: add a short README note`);
    expect(reply.text).toContain("Session");
    expect(reply.text).toContain("Phase:");
    expect(runtime.getState().projects.length).toBe(1);
  });
});

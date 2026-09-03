import fs from "node:fs";
import path from "node:path";
import {
  addWorktree,
  commitAll,
  gitDiff,
  gitStatus,
  listWorktrees,
  readReadmeExcerpt,
  snapshotRepo,
  suggestedWorktreePath,
  type GitRepoSnapshot,
  type GitWorktree
} from "./git.js";
import { applyWorktreeFiles, extractJsonObject } from "./project-files.js";
import { runProcess, type ProcessResult } from "./process.js";
import { ProjectSessionStore } from "./project-store.js";
import type { AgentDefinition, AgentContext } from "./types.js";
import type { ProjectPhase, ProjectSession, StartProjectInput } from "./project-types.js";

const createId = (): string => `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const slugBranch = (sessionId: string): string => `jarvis/${sessionId}`;

export class ProjectWorkshop {
  constructor(
    private readonly agents: AgentDefinition[],
    private readonly makeContext: () => AgentContext,
    private readonly store: ProjectSessionStore
  ) {}

  listSessions(): ProjectSession[] {
    return this.store.list();
  }

  getSession(id: string): ProjectSession {
    const session = this.store.get(id);
    if (!session) throw new Error(`Unknown project session: ${id}`);
    return session;
  }

  latestForRepo(repoPath: string): ProjectSession | undefined {
    return this.store.latestForRepo(path.resolve(repoPath));
  }

  async inspectRepo(repoPath: string): Promise<{ snapshot: GitRepoSnapshot; worktrees: GitWorktree[] }> {
    const snapshot = await snapshotRepo(repoPath);
    return { snapshot, worktrees: snapshot.worktrees };
  }

  async start(input: StartProjectInput): Promise<ProjectSession> {
    const snapshot = await snapshotRepo(input.repoPath);
    const id = createId();
    const branch = input.branch?.trim() || slugBranch(id);
    const worktreePath = suggestedWorktreePath(snapshot.root, id);
    await addWorktree(snapshot.root, worktreePath, branch);

    const session: ProjectSession = {
      id,
      goal: input.goal.trim(),
      repoPath: snapshot.root,
      worktreePath,
      branch,
      phase: "brainstorm",
      loopCount: 0,
      maxLoops: input.maxLoops ?? 3,
      advice: "",
      plan: "",
      implementationNotes: "",
      suggestedCommitMessage: "",
      appliedFiles: [],
      verification: null,
      log: [],
      verifyCommand: input.verifyCommand ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.runBrainstorm(session, snapshot);
    await this.runPlan(session, snapshot);
    this.persist(session);
    return session;
  }

  async advance(sessionId: string): Promise<ProjectSession> {
    const session = this.getSession(sessionId);
    if (session.phase === "done") return session;
    if (session.phase === "brainstorm" || session.phase === "plan") {
      await this.runImplement(session);
    } else if (session.phase === "implement" || session.phase === "loop") {
      await this.runVerify(session);
    } else if (session.phase === "verify") {
      if (session.verification && !session.verification.passed && session.loopCount < session.maxLoops) {
        session.loopCount += 1;
        this.pushLog(session, "loop", `Loop ${session.loopCount}/${session.maxLoops}`);
        session.phase = "loop";
        await this.runImplement(session);
        await this.runVerify(session);
      } else {
        session.phase = "done";
        this.pushLog(session, "done", session.verification?.passed ? "Verification passed." : "Stopped after verification.");
      }
    }
    this.persist(session);
    return session;
  }

  async loopUntilVerified(sessionId: string): Promise<ProjectSession> {
    let session = this.getSession(sessionId);
    while (session.phase !== "done" && session.loopCount <= session.maxLoops) {
      session = await this.advance(session.id);
      if (session.phase === "done") break;
      if (session.verification?.passed) {
        session.phase = "done";
        this.pushLog(session, "done", "Verification passed.");
        this.persist(session);
        break;
      }
      if (session.phase === "verify" && session.loopCount >= session.maxLoops) {
        session.phase = "done";
        this.pushLog(session, "done", "Reached max loops.");
        this.persist(session);
        break;
      }
    }
    return session;
  }

  async commit(sessionId: string, message?: string): Promise<{ session: ProjectSession; result: string }> {
    const session = this.getSession(sessionId);
    const result = await commitAll(
      session.worktreePath,
      message?.trim() || session.suggestedCommitMessage || `feat: ${session.goal}`.slice(0, 72)
    );
    this.pushLog(session, session.phase, result);
    this.persist(session);
    return { session, result };
  }

  async listWorktrees(repoPath: string): Promise<GitWorktree[]> {
    return listWorktrees(repoPath);
  }

  summarize(session: ProjectSession): string {
    const verify = session.verification
      ? `Verify ${session.verification.passed ? "passed" : "failed"}: ${session.verification.notes}`
      : "Not verified yet.";
    return [
      `Session ${session.id}`,
      `Phase: ${session.phase}`,
      `Repo: ${session.repoPath}`,
      `Worktree: ${session.worktreePath}`,
      `Branch: ${session.branch}`,
      `Goal: ${session.goal}`,
      session.advice ? `Advice: ${session.advice}` : "",
      session.plan ? `Plan: ${session.plan}` : "",
      session.implementationNotes ? `Implement: ${session.implementationNotes}` : "",
      verify
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async runBrainstorm(session: ProjectSession, snapshot: GitRepoSnapshot): Promise<void> {
    const agent = this.agent("brainstorm");
    const prompt = this.repoPrompt(session, snapshot, "Brainstorm approaches and advise before we code.");
    session.advice = await agent.respond(prompt, this.makeContext());
    session.phase = "brainstorm";
    this.pushLog(session, "brainstorm", session.advice.slice(0, 400));
  }

  private async runPlan(session: ProjectSession, snapshot: GitRepoSnapshot): Promise<void> {
    const agent = this.agent("planner");
    const prompt = `${this.repoPrompt(session, snapshot, "Turn the advice into an executable plan.")}\nAdvice:\n${session.advice}`;
    session.plan = await agent.respond(prompt, this.makeContext());
    session.phase = "plan";
    this.pushLog(session, "plan", session.plan.slice(0, 400));
  }

  private async runImplement(session: ProjectSession): Promise<void> {
    const snapshot = await snapshotRepo(session.worktreePath);
    const agent = this.agent("implementer");
    const prior = session.verification
      ? `\nPrevious verification failed:\n${session.verification.output}\n${session.verification.notes}`
      : "";
    const prompt = `${this.repoPrompt(session, snapshot, "Implement the plan in this worktree.")}\nPlan:\n${session.plan}${prior}`;
    const raw = await agent.respond(prompt, this.makeContext());
    const parsed = extractJsonObject(raw);
    session.implementationNotes =
      (typeof parsed?.summary === "string" && parsed.summary) ||
      (typeof parsed?.advice === "string" && parsed.advice) ||
      raw;
    if (typeof parsed?.commitMessage === "string" && parsed.commitMessage.trim()) {
      session.suggestedCommitMessage = parsed.commitMessage.trim();
    }
    const files = Array.isArray(parsed?.files) ? (parsed.files as Array<{ path: string; action?: string; content?: string }>) : [];
    session.appliedFiles = applyWorktreeFiles(session.worktreePath, files);
    const status = await gitStatus(session.worktreePath);
    session.implementationNotes += status ? `\nGit status:\n${status}` : "\nGit status: clean";
    session.phase = "implement";
    this.pushLog(
      session,
      "implement",
      `${session.appliedFiles.length} file(s) applied. ${session.implementationNotes.slice(0, 240)}`
    );
  }

  private async runVerify(session: ProjectSession): Promise<void> {
    const command = session.verifyCommand ?? detectVerifyCommand(session.worktreePath);
    let result: ProcessResult;
    let commandLabel: string;
    if (command) {
      commandLabel = `${command[0]} ${command.slice(1).join(" ")}`.trim();
      result = await runProcess(command[0], {
        cwd: session.worktreePath,
        args: command.slice(1),
        timeoutMs: 120_000
      }).catch((error: Error) => ({
        command: command[0],
        args: command.slice(1),
        cwd: session.worktreePath,
        code: 1,
        stdout: "",
        stderr: error.message
      }));
    } else {
      commandLabel = "git diff --stat HEAD";
      const diff = await gitDiff(session.worktreePath);
      result = {
        command: "git",
        args: ["diff", "--stat", "HEAD"],
        cwd: session.worktreePath,
        code: 0,
        stdout: diff || "(no diff)",
        stderr: ""
      };
    }

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, 8000);
    const commandFailed = result.code !== 0;
    const agent = this.agent("verifier");
    const raw = await agent.respond(
      `Goal: ${session.goal}\nCommand: ${commandLabel}\nExit: ${result.code}\nOutput:\n${output}`,
      this.makeContext()
    );
    const parsed = extractJsonObject(raw);
    const passedFromAgent = parsed?.passed === true;
    const passed = commandFailed ? false : parsed ? passedFromAgent : result.code === 0;
    const notes =
      (typeof parsed?.notes === "string" && parsed.notes) ||
      (commandFailed ? "Command failed." : raw);

    session.verification = {
      passed,
      command: commandLabel,
      output,
      notes,
      at: Date.now()
    };
    session.phase = "verify";
    this.pushLog(session, "verify", `${passed ? "pass" : "fail"} · ${notes.slice(0, 240)}`);
  }

  private repoPrompt(session: ProjectSession, snapshot: GitRepoSnapshot, instruction: string): string {
    const readme = readReadmeExcerpt(snapshot.root);
    return [
      instruction,
      `Goal: ${session.goal}`,
      `Repo: ${session.repoPath}`,
      `Worktree: ${session.worktreePath}`,
      `Branch: ${session.branch}`,
      `HEAD: ${snapshot.head} (${snapshot.branch})`,
      `Recent commits:\n${snapshot.recentLog || "(none)"}`,
      `Status:\n${snapshot.status || "clean"}`,
      `Files:\n${snapshot.files.join("\n") || "(none)"}`,
      readme ? `README excerpt:\n${readme}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private agent(id: string): AgentDefinition {
    const agent = this.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new Error(`Unknown agent: ${id}`);
    return agent;
  }

  private pushLog(session: ProjectSession, phase: ProjectPhase, summary: string): void {
    session.log.push({ phase, summary, at: Date.now() });
    session.updatedAt = Date.now();
  }

  private persist(session: ProjectSession): void {
    session.updatedAt = Date.now();
    this.store.save(session);
  }
}

export const detectVerifyCommand = (worktreePath: string): string[] | null => {
  const pkgPath = path.join(worktreePath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.test) return null;
  } catch {
    return null;
  }
  if (fs.existsSync(path.join(worktreePath, "pnpm-lock.yaml"))) return ["pnpm", "test"];
  if (fs.existsSync(path.join(worktreePath, "yarn.lock"))) return ["yarn", "test"];
  return ["npm", "test"];
};

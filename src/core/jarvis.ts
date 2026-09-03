import path from "node:path";
import { createCoreAgents } from "./agents.js";
import type { JarvisBackup } from "./durable-store.js";
import { MessageBus, type AgentMessage } from "./message-bus.js";
import { assertValidAgentMessage, MessagePolicyError } from "./message-guardrails.js";
import { PersistentMemoryStore } from "./persistent-memory.js";
import { parseProjectIntent } from "./project-intent.js";
import { ProjectSessionStore } from "./project-store.js";
import { ProjectWorkshop } from "./project-workshop.js";
import type { ProjectSession, StartProjectInput } from "./project-types.js";
import { SkillRegistry } from "./skills.js";
import type {
  AgentReply,
  AgentTask,
  ChatMessage,
  ClaudeClient,
  SendMessageOptions
} from "./types.js";

export { MessagePolicyError };

export class JarvisRuntime {
  private readonly memory: PersistentMemoryStore;
  private readonly skills: SkillRegistry;
  private readonly messageBus = new MessageBus();
  private readonly agents: ReturnType<typeof createCoreAgents>;
  private readonly history: ChatMessage[] = [];
  private readonly projectStore: ProjectSessionStore;
  private readonly workshop: ProjectWorkshop;
  private readonly backupDir: string;

  constructor(
    claudeClient: ClaudeClient,
    memoryDbPath = `${process.cwd()}/data/jarvis-memory.db`,
    backupDir = `${process.cwd()}/data/backups`,
    projectsDbPath = `${process.cwd()}/data/jarvis-projects.db`
  ) {
    this.memory = new PersistentMemoryStore(memoryDbPath);
    this.skills = new SkillRegistry(this.memory);
    this.projectStore = new ProjectSessionStore(projectsDbPath);
    this.agents = createCoreAgents(claudeClient);
    this.workshop = new ProjectWorkshop(this.agents, () => this.makeContext(), this.projectStore);
    this.backupDir = backupDir;
  }

  async chat(input: string): Promise<AgentReply> {
    const greeter = this.getAgent("greeter");
    const memory = this.getAgent("memory");
    this.history.push({ sender: "user", content: input, at: Date.now() });

    await memory.respond(input, this.makeContext());

    const workshopNote = await this.maybeHandleProjectIntent(input);
    if (workshopNote) {
      this.memory.set("project.latestSummary", workshopNote);
    }

    const text = await greeter.respond(input, this.makeContext());
    this.skills.maybeSelfImprove("greeter", input, text);
    const combined = workshopNote ? `${text}\n\n---\n${workshopNote}` : text;
    this.history.push({ sender: "agent", content: combined, at: Date.now() });
    return { agentId: greeter.id, text: combined };
  }

  async assignTask(agentId: string, task: AgentTask): Promise<AgentReply> {
    const agent = this.getAgent(agentId);
    const outcome = await agent.respond(`${task.title}: ${task.prompt}`, this.makeContext());
    return { agentId: agent.id, text: outcome };
  }

  startProject(input: StartProjectInput): Promise<ProjectSession> {
    return this.workshop.start(input).then((session) => {
      this.rememberProject(session);
      return session;
    });
  }

  advanceProject(sessionId: string): Promise<ProjectSession> {
    return this.workshop.advance(sessionId).then((session) => {
      this.rememberProject(session);
      return session;
    });
  }

  loopProject(sessionId: string): Promise<ProjectSession> {
    return this.workshop.loopUntilVerified(sessionId).then((session) => {
      this.rememberProject(session);
      return session;
    });
  }

  commitProject(sessionId: string, message?: string) {
    return this.workshop.commit(sessionId, message).then((result) => {
      this.rememberProject(result.session);
      return result;
    });
  }

  listProjects(): ProjectSession[] {
    return this.workshop.listSessions();
  }

  getProject(sessionId: string): ProjectSession {
    return this.workshop.getSession(sessionId);
  }

  inspectProjectRepo(repoPath: string) {
    return this.workshop.inspectRepo(repoPath);
  }

  listProjectWorktrees(repoPath: string) {
    return this.workshop.listWorktrees(repoPath);
  }

  sendAgentMessage(
    fromAgentId: string,
    toAgentId: string,
    content: string,
    options?: SendMessageOptions
  ): AgentMessage {
    const guarded = assertValidAgentMessage(
      fromAgentId,
      toAgentId,
      content,
      this.agentIds(),
      options
    );
    return this.messageBus.send(guarded.fromAgentId, guarded.toAgentId, guarded.content, guarded.options);
  }

  getAgentMessages(agentId: string): { inbox: AgentMessage[]; outbox: AgentMessage[] } {
    this.getAgent(agentId);
    return {
      inbox: this.messageBus.inbox(agentId),
      outbox: this.messageBus.outbox(agentId)
    };
  }

  exportBackup(): JarvisBackup {
    return this.memory.exportBackup();
  }

  importBackup(backup: unknown): JarvisBackup {
    return this.memory.importBackup(backup);
  }

  writeLocalBackup(): { path: string; backup: JarvisBackup } {
    return this.memory.writeLocalBackup(this.backupDir);
  }

  getState(): {
    memory: Record<string, string>;
    skills: Record<string, string[]>;
    history: ChatMessage[];
    agents: string[];
    messages: ReturnType<MessageBus["all"]>;
    projects: ProjectSession[];
    backupDir: string;
  } {
    return {
      memory: this.memory.snapshot(),
      skills: this.skills.snapshot(),
      history: this.history,
      agents: this.agentIds(),
      messages: this.messageBus.all(),
      projects: this.workshop.listSessions(),
      backupDir: path.resolve(this.backupDir)
    };
  }

  private async maybeHandleProjectIntent(input: string): Promise<string | null> {
    const recalledRepo = this.memory.get("project.repoPath");
    const intent = parseProjectIntent(input, recalledRepo);
    if (!intent.action) return null;

    if (intent.action === "status" && intent.repoPath) {
      const latest = this.workshop.latestForRepo(intent.repoPath);
      const inspection = await this.workshop.inspectRepo(intent.repoPath);
      if (latest) {
        this.rememberProject(latest);
        return `${this.workshop.summarize(latest)}\n\nWorktrees:\n${inspection.worktrees
          .map((tree) => `- ${tree.path} (${tree.branch ?? "detached"})`)
          .join("\n")}`;
      }
      return `Repo ${inspection.snapshot.root} on ${inspection.snapshot.branch}. No active Jarvis session.\nWorktrees:\n${inspection.worktrees
        .map((tree) => `- ${tree.path} (${tree.branch ?? "detached"})`)
        .join("\n")}`;
    }

    if (intent.action === "advance" && intent.repoPath) {
      const latest = this.workshop.latestForRepo(intent.repoPath);
      if (!latest) {
        return `No active project session for ${intent.repoPath}. Start one with a goal and repo path.`;
      }
      const session = await this.workshop.advance(latest.id);
      this.rememberProject(session);
      return this.workshop.summarize(session);
    }

    if (intent.action === "start" && intent.repoPath && intent.goal) {
      const session = await this.workshop.start({
        repoPath: intent.repoPath,
        goal: intent.goal
      });
      this.rememberProject(session);
      return this.workshop.summarize(session);
    }

    return null;
  }

  private rememberProject(session: ProjectSession): void {
    this.memory.set("project.repoPath", session.repoPath);
    this.memory.set("project.sessionId", session.id);
    this.memory.set("project.goal", session.goal);
    this.memory.set("project.latestSummary", this.workshop.summarize(session));
  }

  private agentIds(): string[] {
    return this.agents.map((agent) => agent.id);
  }

  private getAgent(agentId: string) {
    const agent = this.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new MessagePolicyError("unknown_agent", `Unknown agent: ${agentId}`);
    }
    return agent;
  }

  private makeContext() {
    return {
      remember: (key: string, value: string) => this.memory.set(key, value),
      recall: (key: string) => this.memory.get(key),
      addSkillNote: (agentId: string, note: string) => this.skills.addNote(agentId, note),
      getSkillNotes: (agentId: string) => this.skills.getNotes(agentId),
      sendMessage: async (
        fromAgentId: string,
        toAgentId: string,
        content: string,
        options?: SendMessageOptions
      ) => {
        this.sendAgentMessage(fromAgentId, toAgentId, content, options);
      }
    };
  }
}

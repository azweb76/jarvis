import path from "node:path";
import { createCoreAgents } from "./agents.js";
import type { JarvisBackup } from "./durable-store.js";
import { MessageBus, type AgentMessage } from "./message-bus.js";
import { assertValidAgentMessage, MessagePolicyError } from "./message-guardrails.js";
import { PersistentMemoryStore } from "./persistent-memory.js";
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
  private readonly backupDir: string;

  constructor(
    claudeClient: ClaudeClient,
    memoryDbPath = `${process.cwd()}/data/jarvis-memory.db`,
    backupDir = `${process.cwd()}/data/backups`
  ) {
    this.memory = new PersistentMemoryStore(memoryDbPath);
    this.skills = new SkillRegistry(this.memory);
    this.agents = createCoreAgents(claudeClient);
    this.backupDir = backupDir;
  }

  async chat(input: string): Promise<AgentReply> {
    const greeter = this.getAgent("greeter");
    const memory = this.getAgent("memory");
    this.history.push({ sender: "user", content: input, at: Date.now() });

    await memory.respond(input, this.makeContext());
    const text = await greeter.respond(input, this.makeContext());
    this.skills.maybeSelfImprove("greeter", input, text);
    this.history.push({ sender: "agent", content: text, at: Date.now() });
    return { agentId: greeter.id, text };
  }

  async assignTask(agentId: string, task: AgentTask): Promise<AgentReply> {
    const agent = this.getAgent(agentId);
    const outcome = await agent.respond(`${task.title}: ${task.prompt}`, this.makeContext());
    return { agentId: agent.id, text: outcome };
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
    backupDir: string;
  } {
    return {
      memory: this.memory.snapshot(),
      skills: this.skills.snapshot(),
      history: this.history,
      agents: this.agentIds(),
      messages: this.messageBus.all(),
      backupDir: path.resolve(this.backupDir)
    };
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

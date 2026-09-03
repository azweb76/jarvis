import { createCoreAgents } from "./agents.js";
import type { AgentReply, AgentTask, ChatMessage, ClaudeClient } from "./types.js";
import { MemoryStore } from "./memory.js";
import { MessageBus } from "./message-bus.js";
import { SkillRegistry } from "./skills.js";

export class JarvisRuntime {
  private readonly memory = new MemoryStore();
  private readonly skills = new SkillRegistry();
  private readonly messageBus = new MessageBus();
  private readonly agents: ReturnType<typeof createCoreAgents>;
  private readonly history: ChatMessage[] = [];

  constructor(claudeClient: ClaudeClient) {
    this.agents = createCoreAgents(claudeClient);
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

  getState(): { memory: Record<string, string>; history: ChatMessage[]; agents: string[] } {
    return {
      memory: this.memory.snapshot(),
      history: this.history,
      agents: this.agents.map((agent) => agent.id)
    };
  }

  private getAgent(agentId: string) {
    const agent = this.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    return agent;
  }

  private makeContext() {
    return {
      remember: (key: string, value: string) => this.memory.set(key, value),
      recall: (key: string) => this.memory.get(key),
      addSkillNote: (agentId: string, note: string) => this.skills.addNote(agentId, note),
      getSkillNotes: (agentId: string) => this.skills.getNotes(agentId),
      sendMessage: async (fromAgentId: string, toAgentId: string, content: string) => {
        this.messageBus.send(fromAgentId, toAgentId, content);
      }
    };
  }
}

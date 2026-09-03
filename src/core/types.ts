export type Sender = "user" | "system" | "agent";

export interface ChatMessage {
  sender: Sender;
  content: string;
  at: number;
}

export interface AgentTask {
  title: string;
  prompt: string;
}

export type MessagePriority = "low" | "normal" | "high";

export interface SendMessageOptions {
  priority?: MessagePriority;
  correlationId?: string;
  taskId?: string;
  ttlMs?: number;
}

export interface AgentReply {
  agentId: string;
  text: string;
}

export interface AgentContext {
  remember: (key: string, value: string) => void;
  recall: (key: string) => string | undefined;
  addSkillNote: (agentId: string, note: string) => void;
  getSkillNotes: (agentId: string) => string[];
  sendMessage: (
    fromAgentId: string,
    toAgentId: string,
    content: string,
    options?: SendMessageOptions
  ) => Promise<void>;
}

export interface AgentDefinition {
  id: string;
  role: string;
  goals: string[];
  respond: (input: string, context: AgentContext) => Promise<string>;
}

export interface ClaudeClient {
  complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

import type { MessagePriority, SendMessageOptions } from "./types.js";

export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  at: number;
  priority: MessagePriority;
  correlationId: string;
  taskId?: string;
  expiresAt?: number;
}

export class MessageBus {
  private readonly messages: AgentMessage[] = [];

  send(from: string, to: string, content: string, options?: SendMessageOptions): AgentMessage {
    const now = Date.now();
    const message: AgentMessage = {
      from,
      to,
      content,
      at: now,
      priority: options?.priority ?? "normal",
      correlationId: options?.correlationId ?? this.createCorrelationId(),
      taskId: options?.taskId,
      expiresAt: options?.ttlMs ? now + options.ttlMs : undefined
    };
    this.messages.push(message);
    return message;
  }

  inbox(agentId: string): AgentMessage[] {
    return this.messages
      .filter((message) => message.to === agentId && !this.isExpired(message))
      .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority));
  }

  outbox(agentId: string): AgentMessage[] {
    return this.messages.filter((message) => message.from === agentId);
  }

  all(): AgentMessage[] {
    return [...this.messages];
  }

  private isExpired(message: AgentMessage): boolean {
    return typeof message.expiresAt === "number" && message.expiresAt <= Date.now();
  }

  private priorityWeight(priority: MessagePriority): number {
    if (priority === "high") return 3;
    if (priority === "normal") return 2;
    return 1;
  }

  private createCorrelationId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

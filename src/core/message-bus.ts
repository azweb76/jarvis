export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  at: number;
}

export class MessageBus {
  private readonly messages: AgentMessage[] = [];

  send(from: string, to: string, content: string): void {
    this.messages.push({ from, to, content, at: Date.now() });
  }

  inbox(agentId: string): AgentMessage[] {
    return this.messages.filter((message) => message.to === agentId);
  }
}

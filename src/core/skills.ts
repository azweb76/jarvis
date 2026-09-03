import type { PersistentMemoryStore } from "./persistent-memory.js";

export class SkillRegistry {
  constructor(private readonly store: PersistentMemoryStore) {}

  addNote(agentId: string, note: string): void {
    this.store.addSkillNote(agentId, note);
  }

  getNotes(agentId: string): string[] {
    return this.store.getSkillNotes(agentId);
  }

  snapshot(): Record<string, string[]> {
    return this.store.skillSnapshot();
  }

  maybeSelfImprove(agentId: string, userMessage: string, reply: string): void {
    if (reply.length > 20 && /thank|glad|happy|great/i.test(reply + userMessage)) {
      this.addNote(agentId, "Users like warm and concise responses.");
    }
  }
}

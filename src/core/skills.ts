export class SkillRegistry {
  private notes = new Map<string, string[]>();

  addNote(agentId: string, note: string): void {
    const current = this.notes.get(agentId) ?? [];
    current.push(note);
    this.notes.set(agentId, current.slice(-20));
  }

  getNotes(agentId: string): string[] {
    return this.notes.get(agentId) ?? [];
  }

  maybeSelfImprove(agentId: string, userMessage: string, reply: string): void {
    if (reply.length > 20 && /thank|glad|happy|great/i.test(reply + userMessage)) {
      this.addNote(agentId, "Users like warm and concise responses.");
    }
  }
}

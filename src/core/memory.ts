export class MemoryStore {
  private memory = new Map<string, string>();

  set(key: string, value: string): void {
    this.memory.set(key, value);
  }

  get(key: string): string | undefined {
    return this.memory.get(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.memory.entries());
  }
}

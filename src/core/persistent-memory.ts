import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export class PersistentMemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS memory (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"
    );
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO memory(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, value);
  }

  get(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM memory WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  snapshot(): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM memory").all() as Array<{
      key: string;
      value: string;
    }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
}

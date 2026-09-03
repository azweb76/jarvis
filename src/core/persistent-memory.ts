import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  isJarvisBackup,
  type JarvisBackup,
  writeBackupFile
} from "./durable-store.js";

const MAX_SKILL_NOTES_PER_AGENT = 20;

export class PersistentMemoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skill_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_skill_notes_agent
        ON skill_notes(agent_id, id);
    `);
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

  addSkillNote(agentId: string, note: string): void {
    const insert = this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO skill_notes(agent_id, note, created_at) VALUES(?, ?, ?)")
        .run(agentId, note, Date.now());
      this.db
        .prepare(
          `DELETE FROM skill_notes
           WHERE agent_id = ?
             AND id NOT IN (
               SELECT id FROM skill_notes WHERE agent_id = ? ORDER BY id DESC LIMIT ?
             )`
        )
        .run(agentId, agentId, MAX_SKILL_NOTES_PER_AGENT);
    });
    insert();
  }

  getSkillNotes(agentId: string): string[] {
    const rows = this.db
      .prepare("SELECT note FROM skill_notes WHERE agent_id = ? ORDER BY id ASC")
      .all(agentId) as Array<{ note: string }>;
    return rows.map((row) => row.note);
  }

  skillSnapshot(): Record<string, string[]> {
    const rows = this.db
      .prepare("SELECT agent_id, note FROM skill_notes ORDER BY id ASC")
      .all() as Array<{ agent_id: string; note: string }>;
    const skills: Record<string, string[]> = {};
    for (const row of rows) {
      skills[row.agent_id] ??= [];
      skills[row.agent_id].push(row.note);
    }
    return skills;
  }

  exportBackup(): JarvisBackup {
    return {
      version: 1,
      exportedAt: Date.now(),
      memory: this.snapshot(),
      skills: this.skillSnapshot()
    };
  }

  importBackup(backup: unknown): JarvisBackup {
    if (!isJarvisBackup(backup)) {
      throw new Error("Invalid Jarvis backup payload");
    }
    const apply = this.db.transaction(() => {
      this.db.exec("DELETE FROM memory");
      this.db.exec("DELETE FROM skill_notes");
      for (const [key, value] of Object.entries(backup.memory)) {
        this.set(key, value);
      }
      for (const [agentId, notes] of Object.entries(backup.skills)) {
        for (const note of notes) {
          this.addSkillNote(agentId, note);
        }
      }
    });
    apply();
    return this.exportBackup();
  }

  writeLocalBackup(backupDir: string): { path: string; backup: JarvisBackup } {
    const backup = this.exportBackup();
    return { path: writeBackupFile(backupDir, backup), backup };
  }
}

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ProjectSession } from "./project-types.js";

export class ProjectSessionStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  save(session: ProjectSession): void {
    this.db
      .prepare(
        `INSERT INTO project_sessions(id, json, updated_at) VALUES(?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
      )
      .run(session.id, JSON.stringify(session), session.updatedAt);
  }

  get(id: string): ProjectSession | undefined {
    const row = this.db.prepare("SELECT json FROM project_sessions WHERE id = ?").get(id) as
      | { json: string }
      | undefined;
    return row ? (JSON.parse(row.json) as ProjectSession) : undefined;
  }

  latestForRepo(repoPath: string): ProjectSession | undefined {
    const sessions = this.list().filter((session) => session.repoPath === repoPath);
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  list(): ProjectSession[] {
    const rows = this.db.prepare("SELECT json FROM project_sessions ORDER BY updated_at DESC").all() as Array<{
      json: string;
    }>;
    return rows.map((row) => JSON.parse(row.json) as ProjectSession);
  }
}

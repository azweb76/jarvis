import fs from "node:fs";
import path from "node:path";

export const BACKUP_VERSION = 1 as const;

export interface JarvisBackup {
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  memory: Record<string, string>;
  skills: Record<string, string[]>;
}

export function isJarvisBackup(value: unknown): value is JarvisBackup {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as JarvisBackup;
  if (candidate.version !== BACKUP_VERSION) {
    return false;
  }
  if (typeof candidate.exportedAt !== "number" || !Number.isFinite(candidate.exportedAt)) {
    return false;
  }
  if (!isStringRecord(candidate.memory) || !isSkillMap(candidate.skills)) {
    return false;
  }
  return true;
}

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, entry]) => typeof key === "string" && typeof entry === "string"
  );
};

const isSkillMap = (value: unknown): value is Record<string, string[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, notes]) =>
      typeof key === "string" &&
      Array.isArray(notes) &&
      notes.every((note) => typeof note === "string")
  );
};

export const formatBackupFilename = (exportedAt = Date.now()): string => {
  const stamp = new Date(exportedAt).toISOString().replace(/[:.]/g, "-");
  return `jarvis-backup-${stamp}.json`;
};

export const writeBackupFile = (backupDir: string, backup: JarvisBackup): string => {
  fs.mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(backupDir, formatBackupFilename(backup.exportedAt));
  fs.writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  return filePath;
};

import fs from "node:fs";
import path from "node:path";
import type { ProjectFileChange } from "./project-types.js";

export const extractJsonObject = (text: string): Record<string, unknown> | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

export const applyWorktreeFiles = (
  worktreePath: string,
  files: Array<{ path: string; action?: string; content?: string }>
): ProjectFileChange[] => {
  const root = path.resolve(worktreePath);
  const applied: ProjectFileChange[] = [];
  const limited = files.slice(0, 20);

  for (const file of limited) {
    if (!file.path || typeof file.path !== "string") continue;
    const target = resolveSafePath(root, file.path);
    const action = file.action === "delete" ? "delete" : "write";
    if (action === "delete") {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        applied.push({ path: path.relative(root, target), action });
      }
      continue;
    }
    const content = typeof file.content === "string" ? file.content : "";
    if (Buffer.byteLength(content, "utf8") > 200_000) {
      throw new Error(`Refusing to write oversized file: ${file.path}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    applied.push({ path: path.relative(root, target), action: "write" });
  }

  return applied;
};

const resolveSafePath = (root: string, relativePath: string): string => {
  const target = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error(`Refusing path outside worktree: ${relativePath}`);
  }
  const rel = path.relative(root, target);
  if (rel.split(path.sep).includes(".git")) {
    throw new Error("Refusing to modify .git");
  }
  return target;
};

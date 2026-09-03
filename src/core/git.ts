import fs from "node:fs";
import path from "node:path";
import { runProcess, type ProcessResult } from "./process.js";

export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
}

export interface GitRepoSnapshot {
  root: string;
  branch: string;
  status: string;
  head: string;
  recentLog: string;
  files: string[];
  worktrees: GitWorktree[];
}

const git = async (cwd: string, args: string[], timeoutMs = 15_000): Promise<ProcessResult> => {
  const result = await runProcess("git", { cwd, args, timeoutMs });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`);
  }
  return result;
};

export const resolveGitRoot = async (repoPath: string): Promise<string> => {
  const resolved = path.resolve(expandHome(repoPath));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  const result = await git(resolved, ["rev-parse", "--show-toplevel"]);
  return path.resolve(result.stdout.trim());
};

export const listWorktrees = async (repoPath: string): Promise<GitWorktree[]> => {
  const root = await resolveGitRoot(repoPath);
  const result = await git(root, ["worktree", "list", "--porcelain"]);
  return parseWorktreePorcelain(result.stdout);
};

export const addWorktree = async (
  repoPath: string,
  worktreePath: string,
  branch: string
): Promise<GitWorktree> => {
  const root = await resolveGitRoot(repoPath);
  const target = path.resolve(worktreePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const existing = await git(root, ["branch", "--list", branch]);
  if (existing.stdout.trim()) {
    await git(root, ["worktree", "add", target, branch]);
  } else {
    await git(root, ["worktree", "add", "-b", branch, target]);
  }

  const worktrees = await listWorktrees(root);
  const created = worktrees.find((item) => path.resolve(item.path) === target);
  if (!created) {
    throw new Error(`Worktree was not created at ${target}`);
  }
  return created;
};

export const removeWorktree = async (repoPath: string, worktreePath: string): Promise<void> => {
  const root = await resolveGitRoot(repoPath);
  await git(root, ["worktree", "remove", "--force", path.resolve(worktreePath)]);
};

export const snapshotRepo = async (repoPath: string, fileLimit = 80): Promise<GitRepoSnapshot> => {
  const root = await resolveGitRoot(repoPath);
  const [branch, status, head, recentLog, files, worktrees] = await Promise.all([
    git(root, ["branch", "--show-current"]),
    git(root, ["status", "--short"]),
    git(root, ["rev-parse", "--short", "HEAD"]),
    git(root, ["log", "-5", "--oneline"]),
    git(root, ["ls-tree", "-r", "--name-only", "HEAD"]),
    listWorktrees(root)
  ]);

  return {
    root,
    branch: branch.stdout.trim() || "HEAD",
    status: status.stdout.trim(),
    head: head.stdout.trim(),
    recentLog: recentLog.stdout.trim(),
    files: files.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, fileLimit),
    worktrees
  };
};

export const gitStatus = async (cwd: string): Promise<string> => {
  const result = await git(cwd, ["status", "--short"]);
  return result.stdout.trim();
};

export const gitDiff = async (cwd: string): Promise<string> => {
  const result = await git(cwd, ["diff", "--stat", "HEAD"]);
  return result.stdout.trim();
};

export const commitAll = async (cwd: string, message: string): Promise<string> => {
  await git(cwd, ["add", "-A"]);
  const status = await git(cwd, ["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return "Nothing to commit.";
  }
  await git(cwd, ["commit", "-m", message]);
  const head = await git(cwd, ["rev-parse", "--short", "HEAD"]);
  return `Committed ${head.stdout.trim()}: ${message}`;
};

export const parseWorktreePorcelain = (stdout: string): GitWorktree[] => {
  const blocks = stdout.split("\n\n").map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const pathLine = lines.find((line) => line.startsWith("worktree "));
    const headLine = lines.find((line) => line.startsWith("HEAD "));
    const branchLine = lines.find((line) => line.startsWith("branch "));
    return {
      path: pathLine?.slice("worktree ".length) ?? "",
      head: headLine?.slice("HEAD ".length) ?? "",
      branch: branchLine ? branchLine.slice("branch ".length).replace(/^refs\/heads\//, "") : null,
      bare: lines.includes("bare")
    };
  });
};

export const expandHome = (value: string): string => {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", value.slice(2));
  }
  return value;
};

export const suggestedWorktreePath = (repoRoot: string, sessionId: string): string => {
  return path.resolve(repoRoot, "..", ".jarvis-worktrees", path.basename(repoRoot), sessionId);
};

export const readReadmeExcerpt = (repoRoot: string, maxChars = 2500): string => {
  const candidates = ["README.md", "README.txt", "README"];
  for (const name of candidates) {
    const full = path.join(repoRoot, name);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return fs.readFileSync(full, "utf8").slice(0, maxChars);
    }
  }
  return "";
};

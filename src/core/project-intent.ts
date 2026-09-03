import { expandHome } from "./git.js";
import type { ProjectIntent } from "./project-types.js";

const START_RE =
  /\b(work on|help me (?:with|on)|brainstorm|implement|fix|add|build|refactor|feature|project|worktree)\b/i;
const ADVANCE_RE = /^(keep going|continue|next(?: step)?|implement(?: it)?|verify|loop|try again)\b/i;
const STATUS_RE = /\b(project status|workshop status|git status|worktrees?)\b/i;

export const extractRepoPath = (input: string): string | undefined => {
  const match = input.match(/(?:^|[\s`'"(])(~\/(?:[\w.+@-]+\/)*[\w.+@-]+|\/(?:[\w.+@-]+\/)*[\w.+@-]+)/);
  if (!match) return undefined;
  const value = match[1];
  if (/^\/\/|https?:/i.test(value)) return undefined;
  return expandHome(value);
};

export const parseProjectIntent = (input: string, recalledRepo?: string): ProjectIntent => {
  const trimmed = input.trim();
  const repoPath = extractRepoPath(trimmed) ?? recalledRepo;
  if (STATUS_RE.test(trimmed) && repoPath) {
    return { action: "status", repoPath };
  }
  if (ADVANCE_RE.test(trimmed) && repoPath) {
    return { action: "advance", repoPath };
  }
  if (repoPath && START_RE.test(trimmed)) {
    return {
      action: "start",
      repoPath,
      goal: stripPathFromGoal(trimmed, repoPath, recalledRepo)
    };
  }
  return { action: null, repoPath };
};

const stripPathFromGoal = (input: string, repoPath: string, recalledRepo?: string): string => {
  let goal = input;
  if (recalledRepo && repoPath === recalledRepo) {
    return goal.replace(/\s+/g, " ").trim();
  }
  goal = goal.replace(repoPath, " ").replace(expandHomeDisplay(repoPath), " ");
  return goal.replace(/^[:\-–—,\s]+/, "").replace(/\s+/g, " ").trim() || input.trim();
};

const expandHomeDisplay = (repoPath: string): string => {
  const home = process.env.HOME;
  if (home && repoPath.startsWith(home)) {
    return `~${repoPath.slice(home.length)}`;
  }
  return repoPath;
};

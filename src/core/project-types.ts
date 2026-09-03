export const PROJECT_PHASES = [
  "brainstorm",
  "plan",
  "implement",
  "verify",
  "loop",
  "done"
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export interface ProjectFileChange {
  path: string;
  action: "write" | "delete";
}

export interface ProjectVerification {
  passed: boolean;
  command: string;
  output: string;
  notes: string;
  at: number;
}

export interface ProjectPhaseLog {
  phase: ProjectPhase;
  summary: string;
  at: number;
}

export interface ProjectSession {
  id: string;
  goal: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  phase: ProjectPhase;
  loopCount: number;
  maxLoops: number;
  advice: string;
  plan: string;
  implementationNotes: string;
  suggestedCommitMessage: string;
  appliedFiles: ProjectFileChange[];
  verification: ProjectVerification | null;
  log: ProjectPhaseLog[];
  verifyCommand: string[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface StartProjectInput {
  repoPath: string;
  goal: string;
  branch?: string;
  verifyCommand?: string[];
  maxLoops?: number;
}

export interface ProjectIntent {
  action: "start" | "advance" | "status" | null;
  repoPath?: string;
  goal?: string;
}

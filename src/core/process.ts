import { spawn } from "node:child_process";

export interface ProcessResult {
  command: string;
  args: string[];
  cwd: string;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunProcessOptions {
  cwd: string;
  args: string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export const runProcess = (
  command: string,
  { cwd, args, timeoutMs = 15_000, env }: RunProcessOptions
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (settled) return;
      settled = true;
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ command, args, cwd, code, stdout, stderr });
    });
  });

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Exact identity block required as the first system entry for Claude Code OAuth tokens. */
export const CLAUDE_CODE_IDENTITY_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/** Beta that enables OAuth bearer auth on the Messages API. */
export const CLAUDE_CODE_OAUTH_BETA = "oauth-2025-04-20";

/** Default Claude Code cache lifetime for apiKeyHelper output (5 minutes). */
export const DEFAULT_API_KEY_HELPER_TTL_MS = 5 * 60 * 1000;

export type ClaudeAuthMode = "api_key" | "claude_code_oauth" | "auth_token";

export interface ClaudeAuth {
  mode: ClaudeAuthMode;
  /** Present when mode is api_key. */
  apiKey?: string;
  /** Present when mode is claude_code_oauth or auth_token. */
  authToken?: string;
  /** Where the credential was loaded from (for diagnostics; never includes the secret). */
  source: string;
}

export interface ClaudeSettingsSnapshot {
  apiKeyHelper?: string;
  /** Absolute path of the settings file that supplied apiKeyHelper. */
  apiKeyHelperSourcePath?: string;
  /** Merged env values from settings files (higher-precedence overwrites). */
  env: Record<string, string>;
}

export interface ResolveClaudeAuthOptions {
  homeDir?: string;
  /** Project root used to locate `.claude/settings.json` and `.claude/settings.local.json`. */
  cwd?: string;
  allowCredentialsFile?: boolean;
  allowSettingsHelper?: boolean;
  /** Override shell execution (tests). */
  runHelper?: (command: string) => string;
  /** Override "now" for helper cache TTL (tests). */
  now?: () => number;
}

interface HelperCacheEntry {
  credential: string;
  source: string;
  expiresAt: number;
}

const helperCache = new Map<string, HelperCacheEntry>();

const trim = (value: string | undefined | null): string | undefined => {
  const next = value?.trim();
  return next ? next : undefined;
};

const readJsonObject = (filePath: string): Record<string, unknown> | undefined => {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return undefined;
    }
    return raw as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const displaySettingsPath = (filePath: string, homeDir: string): string => {
  const prefix = homeDir.endsWith(path.sep) ? homeDir : `${homeDir}${path.sep}`;
  if (filePath.startsWith(prefix)) {
    return `~/${filePath.slice(prefix.length).split(path.sep).join("/")}`;
  }
  return filePath;
};

/**
 * Read Claude Code settings files and merge env / apiKeyHelper.
 *
 * Precedence (highest last write wins):
 * 1. `~/.claude/settings.json` (user)
 * 2. `.claude/settings.json` (project)
 * 3. `.claude/settings.local.json` (local)
 */
export const readClaudeSettings = (
  options: { homeDir?: string; cwd?: string } = {}
): ClaudeSettingsSnapshot => {
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();

  const files = [
    path.join(homeDir, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json")
  ];

  const env: Record<string, string> = {};
  let apiKeyHelper: string | undefined;
  let apiKeyHelperSourcePath: string | undefined;

  for (const filePath of files) {
    const data = readJsonObject(filePath);
    if (!data) {
      continue;
    }

    if (data.env && typeof data.env === "object" && !Array.isArray(data.env)) {
      for (const [key, value] of Object.entries(data.env as Record<string, unknown>)) {
        if (typeof value === "string") {
          env[key] = value;
        }
      }
    }

    if (typeof data.apiKeyHelper === "string" && data.apiKeyHelper.trim()) {
      apiKeyHelper = data.apiKeyHelper.trim();
      apiKeyHelperSourcePath = filePath;
    }
  }

  return { apiKeyHelper, apiKeyHelperSourcePath, env };
};

export const clearApiKeyHelperCache = (): void => {
  helperCache.clear();
};

const defaultRunHelper = (command: string): string => {
  // Claude Code runs helpers through the system shell (`/bin/sh -c` on Unix).
  const output = execFileSync("/bin/sh", ["-c", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000
  });
  return output;
};

const resolveHelperTtlMs = (env: NodeJS.ProcessEnv, settingsEnv: Record<string, string>): number => {
  const raw = trim(env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS) ?? trim(settingsEnv.CLAUDE_CODE_API_KEY_HELPER_TTL_MS);
  if (!raw) {
    return DEFAULT_API_KEY_HELPER_TTL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_API_KEY_HELPER_TTL_MS;
};

const runApiKeyHelper = (
  command: string,
  sourcePath: string,
  homeDir: string,
  ttlMs: number,
  options: ResolveClaudeAuthOptions
): { credential: string; source: string } | undefined => {
  const source = `${displaySettingsPath(sourcePath, homeDir)}#apiKeyHelper`;
  const cacheKey = `${sourcePath}::${command}`;
  const now = options.now?.() ?? Date.now();
  const cached = helperCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { credential: cached.credential, source: cached.source };
  }

  const run = options.runHelper ?? defaultRunHelper;
  try {
    const credential = trim(run(command));
    if (!credential) {
      return undefined;
    }
    helperCache.set(cacheKey, {
      credential,
      source,
      expiresAt: now + ttlMs
    });
    return { credential, source };
  } catch {
    return undefined;
  }
};

const authFromHelperCredential = (credential: string, source: string): ClaudeAuth => {
  // OAuth setup tokens are sometimes fetched via helpers; detect by prefix.
  if (credential.startsWith("sk-ant-oat")) {
    return { mode: "claude_code_oauth", authToken: credential, source };
  }
  return { mode: "api_key", apiKey: credential, source };
};

const readClaudeCodeCredentialsFile = (homeDir = os.homedir()): string | undefined => {
  const filePath = path.join(homeDir, ".claude", ".credentials.json");
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      claudeAiOauth?: { accessToken?: string; expiresAt?: number };
    };
    const accessToken = trim(raw.claudeAiOauth?.accessToken);
    if (!accessToken) {
      return undefined;
    }
    const expiresAt = raw.claudeAiOauth?.expiresAt;
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
      return undefined;
    }
    return accessToken;
  } catch {
    return undefined;
  }
};

/**
 * Resolve Anthropic credentials for Jarvis.
 *
 * Priority:
 * 1. `ANTHROPIC_API_KEY` — Console API key (`sk-ant-…`)
 * 2. `CLAUDE_CODE_OAUTH_TOKEN` — long-lived token from `claude setup-token`
 * 3. `ANTHROPIC_AUTH_TOKEN` — generic bearer token (gateway/proxy)
 * 4. `apiKeyHelper` from Claude Code settings (`~/.claude/settings.json`, project/local)
 * 5. Local Claude Code login at `~/.claude/.credentials.json`
 */
export const resolveClaudeAuth = (
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveClaudeAuthOptions = {}
): ClaudeAuth => {
  const apiKey = trim(env.ANTHROPIC_API_KEY);
  if (apiKey) {
    return { mode: "api_key", apiKey, source: "ANTHROPIC_API_KEY" };
  }

  const oauthToken = trim(env.CLAUDE_CODE_OAUTH_TOKEN);
  if (oauthToken) {
    return {
      mode: "claude_code_oauth",
      authToken: oauthToken,
      source: "CLAUDE_CODE_OAUTH_TOKEN"
    };
  }

  const authToken = trim(env.ANTHROPIC_AUTH_TOKEN);
  if (authToken) {
    return { mode: "auth_token", authToken, source: "ANTHROPIC_AUTH_TOKEN" };
  }

  const allowHelper = options.allowSettingsHelper !== false;
  if (allowHelper) {
    const homeDir = options.homeDir ?? os.homedir();
    const settings = readClaudeSettings({ homeDir, cwd: options.cwd });
    if (settings.apiKeyHelper && settings.apiKeyHelperSourcePath) {
      const ttlMs = resolveHelperTtlMs(env, settings.env);
      const helperAuth = runApiKeyHelper(
        settings.apiKeyHelper,
        settings.apiKeyHelperSourcePath,
        homeDir,
        ttlMs,
        options
      );
      if (helperAuth) {
        return authFromHelperCredential(helperAuth.credential, helperAuth.source);
      }
    }
  }

  const allowFile = options.allowCredentialsFile !== false;
  if (allowFile) {
    const fileToken = readClaudeCodeCredentialsFile(options.homeDir);
    if (fileToken) {
      return {
        mode: "claude_code_oauth",
        authToken: fileToken,
        source: "~/.claude/.credentials.json"
      };
    }
  }

  throw new Error(
    "No Claude credentials found. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, configure apiKeyHelper in Claude settings, or sign in with Claude Code (`claude` /login)."
  );
};

export const describeClaudeAuth = (auth: ClaudeAuth): { mode: ClaudeAuthMode; source: string } => ({
  mode: auth.mode,
  source: auth.source
});

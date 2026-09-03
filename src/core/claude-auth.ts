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

/** Max length Claude Code accepts from apiKeyHelper stdout. */
export const MAX_API_KEY_HELPER_OUTPUT_CHARS = 16_384;

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
  /** Config directories that were inspected (for diagnostics). */
  configDirs: string[];
}

export interface ResolveClaudeAuthOptions {
  homeDir?: string;
  /** Project root used to locate `.claude/settings.json` and `.claude/settings.local.json`. */
  cwd?: string;
  allowCredentialsFile?: boolean;
  allowSettingsHelper?: boolean;
  /** Override shell execution (tests). */
  runHelper?: (command: string, env: NodeJS.ProcessEnv) => string;
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
 * Resolve the Claude Code config directory.
 *
 * Claude Code uses `~/.claude`. When `CLAUDE_CONFIG_DIR` is set, that directory
 * is used instead (same as Claude Code).
 */
export const resolveClaudeConfigDir = (
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): string => {
  const configured = trim(env.CLAUDE_CONFIG_DIR);
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(homeDir, ".claude");
};

/**
 * Read Claude Code settings files and merge env / apiKeyHelper.
 *
 * Precedence (highest last write wins):
 * 1. User settings at `~/.claude/settings.json` (or `CLAUDE_CONFIG_DIR/settings.json`)
 * 2. `.claude/settings.json` (project)
 * 3. `.claude/settings.local.json` (local)
 */
export const readClaudeSettings = (
  options: { homeDir?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): ClaudeSettingsSnapshot => {
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const configDir = resolveClaudeConfigDir(homeDir, options.env ?? process.env);
  const configDirs = [configDir];

  const files = [
    path.join(configDir, "settings.json"),
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

  return { apiKeyHelper, apiKeyHelperSourcePath, env, configDirs };
};

export const clearApiKeyHelperCache = (cacheKeyPrefix?: string): void => {
  if (!cacheKeyPrefix) {
    helperCache.clear();
    return;
  }
  for (const key of helperCache.keys()) {
    if (key.startsWith(cacheKeyPrefix)) {
      helperCache.delete(key);
    }
  }
};

const defaultRunHelper = (command: string, helperEnv: NodeJS.ProcessEnv): string => {
  // Claude Code runs helpers through the system shell (`/bin/sh -c` on Unix).
  const output = execFileSync("/bin/sh", ["-c", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    env: helperEnv
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

/**
 * Claude Code accepts a single token of printable ASCII (no banners / log lines).
 * Returns a human-readable reason when the output cannot be used as a credential.
 */
export const validateHelperCredential = (raw: string): { ok: true; credential: string } | { ok: false; reason: string } => {
  const credential = raw.trim();
  if (!credential) {
    return { ok: false, reason: "printed nothing to stdout" };
  }
  if (credential.length > MAX_API_KEY_HELPER_OUTPUT_CHARS) {
    return {
      ok: false,
      reason: `returned ${credential.length} characters (max ${MAX_API_KEY_HELPER_OUTPUT_CHARS})`
    };
  }
  if (/[\r\n\u0000]/.test(credential)) {
    return { ok: false, reason: "returned multiple lines or a NUL byte (print only the key)" };
  }
  // Printable ASCII only (space through ~). Curly quotes / zero-width chars break HTTP headers.
  if (!/^[\x20-\x7E]+$/.test(credential)) {
    return { ok: false, reason: "returned non-ASCII or control characters that cannot be used as an API key" };
  }
  return { ok: true, credential };
};

export class ApiKeyHelperError extends Error {
  readonly source: string;
  readonly detail: string;

  constructor(source: string, detail: string) {
    super(
      `apiKeyHelper is failing (${source}): ${detail}. Run the helper command in your shell, or check GET /api/auth.`
    );
    this.name = "ApiKeyHelperError";
    this.source = source;
    this.detail = detail;
  }
}

const runApiKeyHelper = (
  command: string,
  sourcePath: string,
  homeDir: string,
  ttlMs: number,
  helperEnv: NodeJS.ProcessEnv,
  options: ResolveClaudeAuthOptions
): { credential: string; source: string } => {
  const source = `${displaySettingsPath(sourcePath, homeDir)}#apiKeyHelper`;
  const cacheKey = `${sourcePath}::${command}`;
  const now = options.now?.() ?? Date.now();
  const cached = helperCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { credential: cached.credential, source: cached.source };
  }

  const run = options.runHelper ?? defaultRunHelper;
  let rawOutput: string;
  try {
    rawOutput = run(command, helperEnv);
  } catch (error) {
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "command exited with an error or timed out";
    throw new ApiKeyHelperError(source, detail);
  }

  const validated = validateHelperCredential(rawOutput);
  if (!validated.ok) {
    throw new ApiKeyHelperError(source, validated.reason);
  }

  helperCache.set(cacheKey, {
    credential: validated.credential,
    source,
    expiresAt: now + ttlMs
  });
  return { credential: validated.credential, source };
};

const authFromHelperCredential = (credential: string, source: string): ClaudeAuth => {
  // OAuth setup tokens are sometimes fetched via helpers; detect by prefix.
  if (credential.startsWith("sk-ant-oat")) {
    return { mode: "claude_code_oauth", authToken: credential, source };
  }
  return { mode: "api_key", apiKey: credential, source };
};

const readClaudeCodeCredentialsFile = (
  homeDir = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): { token: string; source: string } | undefined => {
  const configDir = resolveClaudeConfigDir(homeDir, env);
  const filePath = path.join(configDir, ".credentials.json");
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
    return {
      token: accessToken,
      source: displaySettingsPath(filePath, homeDir)
    };
  } catch {
    return undefined;
  }
};

const mergeHelperEnv = (
  processEnv: NodeJS.ProcessEnv,
  settingsEnv: Record<string, string>
): NodeJS.ProcessEnv => {
  // Settings `env` fills gaps and is also passed to the helper subprocess,
  // matching Claude Code applying settings env before running helpers.
  return { ...processEnv, ...settingsEnv };
};

const resolveFromSettingsEnv = (settingsEnv: Record<string, string>): ClaudeAuth | undefined => {
  // Caller already checked process env; settings.env fills gaps only.
  const apiKey = trim(settingsEnv.ANTHROPIC_API_KEY);
  if (apiKey) {
    return { mode: "api_key", apiKey, source: "settings.env.ANTHROPIC_API_KEY" };
  }

  const oauthToken = trim(settingsEnv.CLAUDE_CODE_OAUTH_TOKEN);
  if (oauthToken) {
    return {
      mode: "claude_code_oauth",
      authToken: oauthToken,
      source: "settings.env.CLAUDE_CODE_OAUTH_TOKEN"
    };
  }

  const authToken = trim(settingsEnv.ANTHROPIC_AUTH_TOKEN);
  if (authToken) {
    return { mode: "auth_token", authToken, source: "settings.env.ANTHROPIC_AUTH_TOKEN" };
  }

  return undefined;
};

/**
 * Resolve Anthropic credentials for Jarvis.
 *
 * Priority:
 * 1. `ANTHROPIC_API_KEY` — Console API key (`sk-ant-…`)
 * 2. `CLAUDE_CODE_OAUTH_TOKEN` — long-lived token from `claude setup-token`
 * 3. `ANTHROPIC_AUTH_TOKEN` — generic bearer token (gateway/proxy)
 * 4. Same three keys from Claude settings `env` blocks (when unset in the process)
 * 5. `apiKeyHelper` from Claude Code settings (`~/.claude/settings.json`, project/local)
 * 6. Local Claude Code login at `.credentials.json` under the Claude config dir
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

  const homeDir = options.homeDir ?? os.homedir();
  const settings = readClaudeSettings({ homeDir, cwd: options.cwd, env });

  const fromSettingsEnv = resolveFromSettingsEnv(settings.env);
  if (fromSettingsEnv) {
    return fromSettingsEnv;
  }

  const allowHelper = options.allowSettingsHelper !== false;
  if (allowHelper && settings.apiKeyHelper && settings.apiKeyHelperSourcePath) {
    const ttlMs = resolveHelperTtlMs(env, settings.env);
    const helperEnv = mergeHelperEnv(env, settings.env);
    // A configured helper is the intended credential source. Fail loudly instead of
    // silently falling through (matches Claude Code; avoids opaque 401s).
    const helperAuth = runApiKeyHelper(
      settings.apiKeyHelper,
      settings.apiKeyHelperSourcePath,
      homeDir,
      ttlMs,
      helperEnv,
      options
    );
    return authFromHelperCredential(helperAuth.credential, helperAuth.source);
  }

  const allowFile = options.allowCredentialsFile !== false;
  if (allowFile) {
    const fileAuth = readClaudeCodeCredentialsFile(options.homeDir, env);
    if (fileAuth) {
      return {
        mode: "claude_code_oauth",
        authToken: fileAuth.token,
        source: fileAuth.source
      };
    }
  }

  throw new Error(
    "No Claude credentials found. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, configure apiKeyHelper in ~/.claude/settings.json, or sign in with Claude Code (`claude` /login)."
  );
};

/** Invalidate cached helper output so the next resolve re-runs the command (e.g. after HTTP 401). */
export const invalidateApiKeyHelperCache = (): void => {
  helperCache.clear();
};

export const describeClaudeAuth = (auth: ClaudeAuth): { mode: ClaudeAuthMode; source: string } => ({
  mode: auth.mode,
  source: auth.source
});

export const formatAuthError = (error: unknown, auth?: ClaudeAuth): string => {
  const base = error instanceof Error ? error.message : String(error);
  if (!auth) {
    return base;
  }
  return `${base} (auth: ${auth.mode} via ${auth.source})`;
};

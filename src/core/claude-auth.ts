import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Exact identity block required as the first system entry for Claude Code OAuth tokens. */
export const CLAUDE_CODE_IDENTITY_PROMPT =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/** Beta that enables OAuth bearer auth on the Messages API. */
export const CLAUDE_CODE_OAUTH_BETA = "oauth-2025-04-20";

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

const trim = (value: string | undefined | null): string | undefined => {
  const next = value?.trim();
  return next ? next : undefined;
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
 * 4. Local Claude Code login at `~/.claude/.credentials.json`
 */
export const resolveClaudeAuth = (
  env: NodeJS.ProcessEnv = process.env,
  options: { homeDir?: string; allowCredentialsFile?: boolean } = {}
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
    "No Claude credentials found. Set ANTHROPIC_API_KEY, or CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, or sign in with Claude Code (`claude` /login)."
  );
};

export const describeClaudeAuth = (auth: ClaudeAuth): { mode: ClaudeAuthMode; source: string } => ({
  mode: auth.mode,
  source: auth.source
});

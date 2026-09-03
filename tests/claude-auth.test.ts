import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_IDENTITY_PROMPT,
  resolveClaudeAuth
} from "../src/core/claude-auth.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const makeHomeWithCredentials = (accessToken: string, expiresAt?: number) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-claude-home-"));
  tempDirs.push(home);
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken,
        expiresAt
      }
    })
  );
  return home;
};

describe("resolveClaudeAuth", () => {
  it("prefers ANTHROPIC_API_KEY over OAuth tokens", () => {
    const auth = resolveClaudeAuth(
      {
        ANTHROPIC_API_KEY: "sk-ant-api",
        CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat"
      },
      { allowCredentialsFile: false }
    );
    expect(auth).toEqual({
      mode: "api_key",
      apiKey: "sk-ant-api",
      source: "ANTHROPIC_API_KEY"
    });
  });

  it("uses CLAUDE_CODE_OAUTH_TOKEN when no API key is set", () => {
    const auth = resolveClaudeAuth(
      { CLAUDE_CODE_OAUTH_TOKEN: " sk-ant-oat-from-setup " },
      { allowCredentialsFile: false }
    );
    expect(auth.mode).toBe("claude_code_oauth");
    expect(auth.authToken).toBe("sk-ant-oat-from-setup");
    expect(auth.source).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("falls back to ANTHROPIC_AUTH_TOKEN", () => {
    const auth = resolveClaudeAuth(
      { ANTHROPIC_AUTH_TOKEN: "bearer-gateway-token" },
      { allowCredentialsFile: false }
    );
    expect(auth).toEqual({
      mode: "auth_token",
      authToken: "bearer-gateway-token",
      source: "ANTHROPIC_AUTH_TOKEN"
    });
  });

  it("loads Claude Code login credentials from disk", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-from-file");
    const auth = resolveClaudeAuth({}, { homeDir: home });
    expect(auth.mode).toBe("claude_code_oauth");
    expect(auth.authToken).toBe("sk-ant-oat-from-file");
    expect(auth.source).toBe("~/.claude/.credentials.json");
  });

  it("ignores expired Claude Code credentials on disk", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-expired", Date.now() - 1000);
    expect(() => resolveClaudeAuth({}, { homeDir: home })).toThrow(/No Claude credentials found/);
  });

  it("throws a clear error when nothing is configured", () => {
    expect(() => resolveClaudeAuth({}, { allowCredentialsFile: false })).toThrow(
      /CLAUDE_CODE_OAUTH_TOKEN/
    );
  });
});

describe("Claude Code OAuth constants", () => {
  it("keeps the required identity prompt exact", () => {
    expect(CLAUDE_CODE_IDENTITY_PROMPT).toBe(
      "You are Claude Code, Anthropic's official CLI for Claude."
    );
    expect(CLAUDE_CODE_IDENTITY_PROMPT).toHaveLength(57);
  });
});

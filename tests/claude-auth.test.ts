import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApiKeyHelperError,
  CLAUDE_CODE_IDENTITY_PROMPT,
  clearApiKeyHelperCache,
  formatAuthError,
  readClaudeSettings,
  resolveClaudeAuth,
  resolveClaudeConfigDir,
  validateHelperCredential
} from "../src/core/claude-auth.js";

const tempDirs: string[] = [];

afterEach(() => {
  clearApiKeyHelperCache();
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

const makeHomeWithSettings = (settings: Record<string, unknown>) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-claude-home-"));
  tempDirs.push(home);
  const claudeDir = path.join(home, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "settings.json"), JSON.stringify(settings));
  return home;
};

const makeProjectWithSettings = (
  settings: Record<string, unknown>,
  localSettings?: Record<string, unknown>
) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-claude-cwd-"));
  tempDirs.push(cwd);
  const claudeDir = path.join(cwd, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "settings.json"), JSON.stringify(settings));
  if (localSettings) {
    fs.writeFileSync(path.join(claudeDir, "settings.local.json"), JSON.stringify(localSettings));
  }
  return cwd;
};

describe("resolveClaudeAuth", () => {
  it("prefers ANTHROPIC_API_KEY over OAuth tokens", () => {
    const auth = resolveClaudeAuth(
      {
        ANTHROPIC_API_KEY: "sk-ant-api",
        CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat"
      },
      { allowCredentialsFile: false, allowSettingsHelper: false }
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
      { allowCredentialsFile: false, allowSettingsHelper: false }
    );
    expect(auth.mode).toBe("claude_code_oauth");
    expect(auth.authToken).toBe("sk-ant-oat-from-setup");
    expect(auth.source).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("falls back to ANTHROPIC_AUTH_TOKEN", () => {
    const auth = resolveClaudeAuth(
      { ANTHROPIC_AUTH_TOKEN: "bearer-gateway-token" },
      { allowCredentialsFile: false, allowSettingsHelper: false }
    );
    expect(auth).toEqual({
      mode: "auth_token",
      authToken: "bearer-gateway-token",
      source: "ANTHROPIC_AUTH_TOKEN"
    });
  });

  it("loads Claude Code login credentials from disk", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-from-file");
    const auth = resolveClaudeAuth({}, { homeDir: home, allowSettingsHelper: false });
    expect(auth.mode).toBe("claude_code_oauth");
    expect(auth.authToken).toBe("sk-ant-oat-from-file");
    expect(auth.source).toBe("~/.claude/.credentials.json");
  });

  it("ignores expired Claude Code credentials on disk", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-expired", Date.now() - 1000);
    expect(() =>
      resolveClaudeAuth({}, { homeDir: home, allowSettingsHelper: false })
    ).toThrow(/No Claude credentials found/);
  });

  it("throws a clear error when nothing is configured", () => {
    expect(() =>
      resolveClaudeAuth({}, { allowCredentialsFile: false, allowSettingsHelper: false })
    ).toThrow(/apiKeyHelper/);
  });

  it("uses apiKeyHelper from ~/.claude/settings.json", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "printf 'sk-ant-helper-key'"
    });
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        cwd: home,
        allowCredentialsFile: false,
        runHelper: () => "sk-ant-helper-key\n"
      }
    );
    expect(auth).toEqual({
      mode: "api_key",
      apiKey: "sk-ant-helper-key",
      source: "~/.claude/settings.json#apiKeyHelper"
    });
  });

  it("honors CLAUDE_CONFIG_DIR for settings", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-claude-home-"));
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-claude-config-"));
    tempDirs.push(home, configDir);
    fs.writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ apiKeyHelper: "custom-dir-helper" })
    );
    const auth = resolveClaudeAuth(
      { CLAUDE_CONFIG_DIR: configDir },
      {
        homeDir: home,
        allowCredentialsFile: false,
        runHelper: () => "sk-ant-from-config-dir"
      }
    );
    expect(auth.apiKey).toBe("sk-ant-from-config-dir");
    expect(auth.source.includes("settings.json#apiKeyHelper")).toBe(true);
  });

  it("executes apiKeyHelper through /bin/sh by default", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "printf '%s' 'sk-ant-shell-helper'"
    });
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        cwd: home,
        allowCredentialsFile: false
      }
    );
    expect(auth.apiKey).toBe("sk-ant-shell-helper");
    expect(auth.source).toBe("~/.claude/settings.json#apiKeyHelper");
  });

  it("passes settings env into the helper subprocess", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "helper",
      env: { VAULT_ADDR: "https://vault.example" }
    });
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        allowCredentialsFile: false,
        runHelper: (_command, helperEnv) => {
          seenEnv = helperEnv;
          return "sk-ant-with-settings-env";
        }
      }
    );
    expect(auth.apiKey).toBe("sk-ant-with-settings-env");
    expect(seenEnv?.VAULT_ADDR).toBe("https://vault.example");
  });

  it("uses credentials from settings env when process env is unset", () => {
    const home = makeHomeWithSettings({
      env: { ANTHROPIC_API_KEY: "sk-ant-from-settings-env" }
    });
    const auth = resolveClaudeAuth(
      {},
      { homeDir: home, allowCredentialsFile: false, allowSettingsHelper: false }
    );
    expect(auth).toEqual({
      mode: "api_key",
      apiKey: "sk-ant-from-settings-env",
      source: "settings.env.ANTHROPIC_API_KEY"
    });
  });

  it("treats oat-prefixed helper output as Claude Code OAuth", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "vault-read"
    });
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        allowCredentialsFile: false,
        runHelper: () => "sk-ant-oat-from-helper"
      }
    );
    expect(auth.mode).toBe("claude_code_oauth");
    expect(auth.authToken).toBe("sk-ant-oat-from-helper");
    expect(auth.source).toBe("~/.claude/settings.json#apiKeyHelper");
  });

  it("prefers env credentials over apiKeyHelper", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "should-not-run"
    });
    let helperCalls = 0;
    const auth = resolveClaudeAuth(
      { ANTHROPIC_API_KEY: "sk-ant-env" },
      {
        homeDir: home,
        allowCredentialsFile: false,
        runHelper: () => {
          helperCalls += 1;
          return "sk-ant-helper";
        }
      }
    );
    expect(auth.source).toBe("ANTHROPIC_API_KEY");
    expect(helperCalls).toBe(0);
  });

  it("prefers apiKeyHelper over stored Claude Code login credentials", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-from-file");
    fs.writeFileSync(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify({ apiKeyHelper: "helper" })
    );
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        runHelper: () => "sk-ant-from-helper"
      }
    );
    expect(auth.apiKey).toBe("sk-ant-from-helper");
    expect(auth.source).toBe("~/.claude/settings.json#apiKeyHelper");
  });

  it("lets project local settings override user apiKeyHelper", () => {
    const home = makeHomeWithSettings({ apiKeyHelper: "user-helper" });
    const cwd = makeProjectWithSettings(
      { apiKeyHelper: "project-helper" },
      { apiKeyHelper: "local-helper" }
    );
    const auth = resolveClaudeAuth(
      {},
      {
        homeDir: home,
        cwd,
        allowCredentialsFile: false,
        runHelper: (command) => {
          if (command === "local-helper") {
            return "sk-ant-local";
          }
          throw new Error(`unexpected helper: ${command}`);
        }
      }
    );
    expect(auth.apiKey).toBe("sk-ant-local");
    expect(auth.source.endsWith(".claude/settings.local.json#apiKeyHelper")).toBe(true);
  });

  it("caches apiKeyHelper output until TTL expires", () => {
    const home = makeHomeWithSettings({
      apiKeyHelper: "rotating",
      env: { CLAUDE_CODE_API_KEY_HELPER_TTL_MS: "1000" }
    });
    let calls = 0;
    let now = 1_000;
    const options = {
      homeDir: home,
      allowCredentialsFile: false,
      now: () => now,
      runHelper: () => {
        calls += 1;
        return `sk-ant-call-${calls}`;
      }
    };

    const first = resolveClaudeAuth({}, options);
    const second = resolveClaudeAuth({}, options);
    expect(first.apiKey).toBe("sk-ant-call-1");
    expect(second.apiKey).toBe("sk-ant-call-1");
    expect(calls).toBe(1);

    now = 2_100;
    const third = resolveClaudeAuth({}, options);
    expect(third.apiKey).toBe("sk-ant-call-2");
    expect(calls).toBe(2);
  });

  it("throws when apiKeyHelper fails instead of silently falling through", () => {
    const home = makeHomeWithCredentials("sk-ant-oat-fallback");
    fs.writeFileSync(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify({ apiKeyHelper: "broken" })
    );
    expect(() =>
      resolveClaudeAuth(
        {},
        {
          homeDir: home,
          runHelper: () => {
            throw new Error("helper failed");
          }
        }
      )
    ).toThrow(ApiKeyHelperError);
  });

  it("throws when apiKeyHelper returns a banner instead of a key", () => {
    const home = makeHomeWithSettings({ apiKeyHelper: "noisy" });
    expect(() =>
      resolveClaudeAuth(
        {},
        {
          homeDir: home,
          allowCredentialsFile: false,
          runHelper: () => "Logged in to vault\nsk-ant-real-key"
        }
      )
    ).toThrow(/multiple lines/);
  });
});

describe("validateHelperCredential", () => {
  it("accepts a single ASCII token", () => {
    expect(validateHelperCredential(" sk-ant-ok \n")).toEqual({
      ok: true,
      credential: "sk-ant-ok"
    });
  });

  it("rejects empty output", () => {
    expect(validateHelperCredential("   ").ok).toBe(false);
  });
});

describe("resolveClaudeConfigDir", () => {
  it("uses ~/.claude by default", () => {
    expect(resolveClaudeConfigDir("/tmp/home", {})).toBe(path.join("/tmp/home", ".claude"));
  });

  it("prefers CLAUDE_CONFIG_DIR when set", () => {
    expect(resolveClaudeConfigDir("/tmp/home", { CLAUDE_CONFIG_DIR: "/custom/claude" })).toBe(
      path.resolve("/custom/claude")
    );
  });
});

describe("readClaudeSettings", () => {
  it("merges env blocks with local winning", () => {
    const home = makeHomeWithSettings({
      env: { A: "user", B: "user-b" }
    });
    const cwd = makeProjectWithSettings(
      { env: { B: "project", C: "project-c" } },
      { env: { C: "local" } }
    );
    const settings = readClaudeSettings({ homeDir: home, cwd });
    expect(settings.env).toEqual({ A: "user", B: "project", C: "local" });
  });
});

describe("formatAuthError", () => {
  it("appends auth diagnostics without secrets", () => {
    expect(
      formatAuthError(new Error("401 API key is invalid"), {
        mode: "api_key",
        apiKey: "sk-secret",
        source: "~/.claude/settings.json#apiKeyHelper"
      })
    ).toBe("401 API key is invalid (auth: api_key via ~/.claude/settings.json#apiKeyHelper)");
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

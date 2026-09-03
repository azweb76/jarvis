import Anthropic from "@anthropic-ai/sdk";
import {
  CLAUDE_CODE_IDENTITY_PROMPT,
  CLAUDE_CODE_OAUTH_BETA,
  describeClaudeAuth,
  formatAuthError,
  invalidateApiKeyHelperCache,
  resolveClaudeAuth,
  type ClaudeAuth
} from "./claude-auth.js";
import type { ClaudeClient } from "./types.js";

const isAuthFailure = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b/.test(message) || /authentication_error/i.test(message);
};

export class AnthropicClaudeClient implements ClaudeClient {
  private client: Anthropic;
  private model: string;
  private auth: ClaudeAuth;
  private helperRetried = false;

  constructor(
    model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
    auth: ClaudeAuth = resolveClaudeAuth()
  ) {
    this.model = model;
    this.auth = auth;
    this.client = this.buildClient(auth);
  }

  private buildClient(auth: ClaudeAuth): Anthropic {
    if (auth.mode === "api_key") {
      // Send Console / helper API keys as x-api-key only. Setting authToken as
      // well put the same secret in Authorization: Bearer, which Anthropic's
      // Messages API rejects with authentication_error ("API key is invalid")
      // even when the key itself is valid. Gateways that need Bearer should set
      // ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL + a bearer-shaped helper.
      return new Anthropic({
        apiKey: auth.apiKey
      });
    }

    // Claude Code / bearer OAuth: Authorization header only (no x-api-key).
    return new Anthropic({
      apiKey: null,
      authToken: auth.authToken,
      defaultHeaders: {
        "x-app": "cli",
        "user-agent": "claude-cli/2.0.0 (external, jarvis)"
      }
    });
  }

  getAuthInfo(): { mode: ClaudeAuth["mode"]; source: string } {
    return describeClaudeAuth(this.auth);
  }

  /** Re-run credential resolution (clears apiKeyHelper cache first). */
  refreshAuth(): ClaudeAuth {
    invalidateApiKeyHelperCache();
    this.auth = resolveClaudeAuth();
    this.client = this.buildClient(this.auth);
    this.helperRetried = false;
    return this.auth;
  }

  private async withAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const fromHelper = this.auth.source.includes("#apiKeyHelper");
      if (fromHelper && !this.helperRetried && isAuthFailure(error)) {
        this.helperRetried = true;
        this.refreshAuth();
        try {
          return await operation();
        } catch (retryError) {
          throw new Error(formatAuthError(retryError, this.auth));
        }
      }
      throw new Error(formatAuthError(error, this.auth));
    }
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.withAuthRetry(async () => {
      if (this.auth.mode === "api_key") {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }]
        });
        const first = response.content.find((chunk) => chunk.type === "text");
        return first?.text?.trim() || "I am here and listening.";
      }

      // OAuth tokens require the Claude Code identity as the first system block
      // and the beta Messages route with oauth-2025-04-20.
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 300,
        betas: [CLAUDE_CODE_OAUTH_BETA],
        system: [
          { type: "text", text: CLAUDE_CODE_IDENTITY_PROMPT },
          { type: "text", text: systemPrompt }
        ],
        messages: [{ role: "user", content: userPrompt }]
      });

      const first = response.content.find((chunk) => chunk.type === "text");
      return first && "text" in first ? first.text.trim() : "I am here and listening.";
    });
  }
}

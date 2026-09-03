import Anthropic from "@anthropic-ai/sdk";
import {
  CLAUDE_CODE_IDENTITY_PROMPT,
  CLAUDE_CODE_OAUTH_BETA,
  describeClaudeAuth,
  resolveClaudeAuth,
  type ClaudeAuth
} from "./claude-auth.js";
import type { ClaudeClient } from "./types.js";

export class AnthropicClaudeClient implements ClaudeClient {
  private client: Anthropic;
  private model: string;
  private auth: ClaudeAuth;

  constructor(
    model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
    auth: ClaudeAuth = resolveClaudeAuth()
  ) {
    this.auth = auth;
    this.model = model;

    if (auth.mode === "api_key") {
      // Claude Code's apiKeyHelper sends the credential as both x-api-key and
      // Authorization: Bearer so gateways that read either header work.
      if (auth.source.includes("#apiKeyHelper") && auth.apiKey) {
        this.client = new Anthropic({
          apiKey: auth.apiKey,
          authToken: auth.apiKey
        });
        return;
      }
      this.client = new Anthropic({
        apiKey: auth.apiKey
      });
      return;
    }

    // Claude Code / bearer OAuth: Authorization header only (no x-api-key).
    this.client = new Anthropic({
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

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
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
  }
}

import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "./types.js";

export class AnthropicClaudeClient implements ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor(model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514") {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.model = model;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    });

    const first = response.content.find((chunk) => chunk.type === "text");
    return first?.text?.trim() || "I am here and listening.";
  }
}

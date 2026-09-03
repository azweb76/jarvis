# Jarvis Web App

Jarvis is a TypeScript web application with a multi-agent runtime and Claude integration.
It uses ESM modules, pnpm, and Vitest.
It is currently designed for a single local desktop user profile (no auth/user isolation).

## Stack

- TypeScript
- Node + Express
- Claude SDK (`@anthropic-ai/sdk`) with API key or Claude Code OAuth auth
- React + Material UI v9 (light/dark/system color schemes)
- Vite for frontend SPA assets
- Vitest for tests
- pnpm for package management

## Authentication

Jarvis resolves Claude credentials in this order:

1. `ANTHROPIC_API_KEY` — Anthropic Console API key
2. `CLAUDE_CODE_OAUTH_TOKEN` — long-lived OAuth token from `claude setup-token` (Pro/Max/Team/Enterprise)
3. `ANTHROPIC_AUTH_TOKEN` — bearer token for an LLM gateway/proxy
4. `apiKeyHelper` from Claude Code settings (user / project / local `settings.json`)
5. Local Claude Code login at `~/.claude/.credentials.json` (from `claude` `/login`)

Generate a setup token:

```bash
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN="…"
pnpm dev
```

Or use Claude Code's `apiKeyHelper` (same setting Claude Code reads):

```json
// ~/.claude/settings.json
{
  "apiKeyHelper": "op read 'op://Personal/Anthropic/credential'"
}
```

Jarvis runs that command through `/bin/sh`, caches stdout for 5 minutes by default (override with `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`), and prefers local/project settings over user settings when they set `apiKeyHelper`.

Optional: `CLAUDE_MODEL` overrides the default model id.

Inspect the active auth mode (never returns secrets):

```bash
curl http://localhost:3000/api/auth
```

## Features implemented

- Chat with a friendly personal assistant ("greeter" agent)
  - HUD labels this **Voice link**; input is still typed text until Phase 1 in [BACKLOG.md](./BACKLOG.md)
- Multi-agent system:
  - `greeter`: user-facing conversational agent
  - `memory`: stores user profile and preferences
  - `planner`: creates lightweight plans/tasks
- Agent-to-agent communication with `sendMessage` on a message bus
  - structured message envelope: `priority`, `correlationId`, `taskId`, `ttlMs`
- Task assignment endpoint: assign tasks to specific agents
- Self-improvement primitives:
  - SQLite-backed memory store for persistent context in runtime
  - Skill notes registry that evolves with interactions
- Agent message APIs:
  - inspect per-agent inbox/outbox and send structured agent messages via HTTP
  - React HUD UI for inbox/outbox is not ported yet

## Run

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## API

- `POST /api/chat`
  - body: `{ "message": "hello" }`
- `POST /api/agents/:agentId/tasks`
  - body: `{ "title": "task", "prompt": "details" }`
- `GET /api/state`
  - returns memory/history/agent list
- `GET /api/auth`
  - returns `{ "mode": "api_key" | "claude_code_oauth" | "auth_token", "source": "…" }`
- `GET /api/agents/:agentId/messages`
  - returns inbox and outbox for an agent
- `POST /api/agents/messages`
  - send a structured message between agents
  - body: `{ "fromAgentId": "planner", "toAgentId": "memory", "content": "note", "priority": "high", "correlationId": "corr-1", "taskId": "task-9", "ttlMs": 60000 }`

## Backlog

See [BACKLOG.md](./BACKLOG.md) for prioritized next steps, including the voice I/O plan.

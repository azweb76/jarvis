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
4. The same three keys from Claude settings `env` blocks (when unset in the process)
5. `apiKeyHelper` from Claude Code settings (user / project / local `settings.json`)
6. Local Claude Code login at `.credentials.json` under the Claude config dir (from `claude` `/login`)

User settings and credentials are read from `~/.claude/` (or `CLAUDE_CONFIG_DIR` when set).

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

Jarvis runs that command through `/bin/sh`, passes merged settings `env` into the helper, caches stdout for 5 minutes by default (override with `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`), and prefers local/project settings over user settings when they set `apiKeyHelper`. The helper must print **only** the credential (single printable-ASCII token). A configured helper that fails or prints a banner/log line surfaces as an `apiKeyHelper is failing` error instead of a generic 401.

If chat still returns `FAULT · 401 … API key is invalid`, check which credential Jarvis actually used:

```bash
curl http://localhost:3000/api/auth
```

A stale `ANTHROPIC_API_KEY` in your shell or `.env` overrides `apiKeyHelper`. Unset it if you intend to use the helper. 401 responses now include `(auth: … via …)` so the active source is visible in the UI.

Optional: `CLAUDE_MODEL` overrides the default model id.

Optional: `ANTHROPIC_BASE_URL` routes requests through an LLM gateway/proxy (same as Claude Code). Process env wins; otherwise Jarvis reads it from Claude settings `env`:

```json
// ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://llm-gateway.example.com",
    "ANTHROPIC_AUTH_TOKEN": "sk-gateway-key"
  }
}
```

`GET /api/auth` reports the active `baseUrl` and `baseUrlSource` when one is configured.

Optional: `GITHUB_TOKEN` enables GitHub repository search and clone (HUD + chat + `/api/github/*`).
Optional: `JARVIS_REPOS_DIR` sets where clones land (default `./data/repos`).

## Features implemented

- Chat with a friendly personal assistant ("greeter" agent)
- Multi-agent system:
  - `greeter`: user-facing conversational agent
  - `memory`: stores user profile and preferences
  - `brainstorm`: options, recommendation, and risks before coding
  - `planner`: creates lightweight plans/tasks with a verify step
  - `implementer`: applies focused file changes in a git worktree
  - `verifier`: interprets check output and recommends looping when needed
- Project workshop (advise along the way):
  - brainstorm → plan → implement → verify → loop
  - creates an isolated `git worktree` + branch under `../.jarvis-worktrees/<repo>/<session>`
  - chat intents: `help me work on /path/to/repo: …`, `keep going`, `project status`
  - HTTP APIs to start/advance/loop/commit sessions and inspect worktrees
- GitHub repo lookup/clone (`GITHUB_TOKEN`):
  - live search in the HUD (debounced, abortable, short TTL cache)
  - clone into `JARVIS_REPOS_DIR` (default `data/repos/<owner>/<repo>`) and fill the workshop repo path
  - chat intents: `search github for …`, `lookup github owner/repo`, `clone owner/repo`
- Agent-to-agent communication with `sendMessage` on a message bus
  - structured message envelope: `priority`, `correlationId`, `taskId`, `ttlMs`
- Task assignment endpoint: assign tasks to specific agents
- Self-improvement primitives:
  - SQLite-backed memory **and skill notes** (same local database)
  - Skill notes registry that evolves with interactions
- Local backup/export of memory and skills (`GET /api/data/export`, `POST /api/data/backup`, `POST /api/data/import`) plus HUD archive controls
- Inter-agent message guardrails: known agents only, content/TTL/priority/id validation
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
  - returns memory, skills, history, agents, message bus snapshot, project sessions, and backupDir
- `GET /api/auth`
  - returns `{ "mode", "source", "baseUrl", "baseUrlSource", "apiKeyHelperConfigured", "apiKeyHelperSourcePath", "configDirs", "envOverridesHelper" }` (never secrets)
- `GET /api/agents/:agentId/messages`
  - returns inbox and outbox for an agent
- `POST /api/agents/messages`
  - send a structured message between agents
  - body: `{ "fromAgentId": "planner", "toAgentId": "memory", "content": "note", "priority": "high", "correlationId": "corr-1", "taskId": "task-9", "ttlMs": 60000 }`
  - unknown agents, empty/oversized content, invalid priority/TTL/ids return `400`
- `GET /api/data/export`
  - download a JSON backup of memory and skill notes
- `POST /api/data/backup`
  - write a timestamped JSON snapshot under `data/backups/`
- `POST /api/data/import`
  - restore from a backup object (`{ "version": 1, "exportedAt": …, "memory": {…}, "skills": {…} }`)
- `GET /api/projects`
  - list project workshop sessions
- `POST /api/projects`
  - start brainstorm+plan in a new git worktree
  - body: `{ "repoPath": "/path/to/repo", "goal": "…", "branch": "optional", "maxLoops": 3 }`
- `POST /api/projects/:sessionId/advance`
  - move to the next phase (implement → verify → done, looping when verify fails)
- `POST /api/projects/:sessionId/loop`
  - keep advancing until verify passes or max loops
- `POST /api/projects/:sessionId/commit`
  - `git add -A && git commit` inside the session worktree
  - body: `{ "message": "optional commit message" }`
- `GET /api/git/worktrees?repoPath=/path/to/repo`
  - repo snapshot + `git worktree list`
- `GET /api/github/status`
  - `{ configured, reposDir, apiBase }` (never the token)
- `GET /api/github/search?q=…&perPage=8`
  - GitHub repository search (requires `GITHUB_TOKEN`)
- `GET /api/github/repos/:owner/:repo`
  - lookup one repository
- `POST /api/github/clone`
  - body: `{ "fullName": "owner/repo", "destination": "optional/path" }`
- `GET /api/github/cloned`
  - list local clones under `JARVIS_REPOS_DIR`

## Backlog

See [BACKLOG.md](./BACKLOG.md) for prioritized next steps.

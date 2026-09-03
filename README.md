# Jarvis Web App

Jarvis is a TypeScript web application with a multi-agent runtime and Claude integration.
It uses ESM modules, pnpm, and Vitest.

## Stack

- TypeScript
- Node + Express
- Claude SDK (`@anthropic-ai/sdk`) with preconfigured auth via `ANTHROPIC_API_KEY`
- React + Material UI v9 (light/dark/system color schemes)
- Vite for frontend SPA assets
- Vitest for tests
- pnpm for package management

## Features implemented

- Chat with a friendly personal assistant ("greeter" agent)
- Multi-agent system:
  - `greeter`: user-facing conversational agent
  - `memory`: stores user profile and preferences
  - `planner`: creates lightweight plans/tasks
- Agent-to-agent communication with `sendMessage` on a message bus
- Task assignment endpoint: assign tasks to specific agents
- Self-improvement primitives:
  - Memory store for persistent context in runtime
  - Skill notes registry that evolves with interactions

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

## Backlog

See [BACKLOG.md](./BACKLOG.md) for prioritized next steps.
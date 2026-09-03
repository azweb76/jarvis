# Jarvis Product Backlog

## P0 - Core reliability and capability

1. Persist memory and skill notes to durable storage (SQLite/Postgres/Redis).
2. Add streaming chat responses and partial token rendering.
3. Add stronger agent orchestration policy (routing, retries, fallback agent).
4. Add local backup/export for memory and skills data.
5. Add lightweight guardrails and validation policies for inter-agent messages.

## P1 - Better assistant experience

1. Add personality profiles (friend, coach, concise assistant).
2. Add conversation summaries to reduce context length.
3. Add planner-to-executor workflow where planner creates tasks for specialist agents.
4. Add task board UI (create, assign, status updates, done).
5. Add memory controls in UI (view/edit/delete stored facts).
6. Deepen project workshop: multi-repo dashboards, PR creation from worktrees, richer loop telemetry.

## Recently completed

- Structured `SendMessage` envelopes with `priority`, `correlationId`, `taskId`, and `ttlMs`
- Project workshop with git worktrees: brainstorm → plan → implement → verify → loop

## P2 - Self-improvement and skills

1. Add explicit skill-learning loop:
   - detect successful interactions
   - generate reusable "skill cards"
   - test skill cards offline
2. Add skill versioning and rollback.
3. Add reflection agent that reviews failed interactions and proposes improvements.
4. Add eval suite for greeting quality, helpfulness, and tone safety.

## P3 - Developer productivity

1. Add end-to-end tests (Playwright).
2. Add linting and formatting (ESLint + Prettier).
3. Add Dockerfile and devcontainer support.
4. Add CI workflow for test/build checks.
5. Add observability (structured logs, traces, metrics).

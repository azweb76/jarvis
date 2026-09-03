# Jarvis Product Backlog

## Voice I/O — plan (feasible)

Yes: expose voice as a **browser I/O adapter** over the existing text chat path. Do not send audio to Claude, and do not try to reuse Claude Code `/voice`.

### Current state

- The HUD already presents chat as **Voice link** (`ChatPanel`) and copy says “Speak freely”, but the surface is text-only.
- Runtime I/O is `POST /api/chat` with `{ message: string }` → `{ text: string }`. `JarvisRuntime.chat()` and `ClaudeClient.complete()` are string-in / string-out.
- Anthropic Messages API still has **no audio content blocks**. Claude understands voice only after something else transcribes it.
- Claude Code `/voice` is CLI/VS Code dictation: Claude.ai account, local mic, Anthropic transcription websocket. It is **not** a public STT API Jarvis can call with `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`.
- This app is a single local desktop profile on `http://localhost:3000`, which is a secure context, so the browser can request the microphone.

### Recommended shape

Keep Claude as the brain. Add STT and TTS at the edges:

```
mic → STT → POST /api/chat (existing) → TTS → speaker
                 ↑ typed Transmit still works
```

Typed and spoken input must share one submit path in `ChatPanel` so history, busy state, and errors stay consistent.

### Phase 1 — Browser voice link (first ship)

Use Web Speech APIs so v1 needs no new secrets or audio backend:

- **STT:** `webkitSpeechRecognition` / `SpeechRecognition` (Chromium; Edge). Push-to-talk mic on the Voice link panel; live transcript into Transmit; auto-send when recognition ends (with a short-utterance guard so accidental taps do not send one word).
- **TTS:** `speechSynthesis` for Jarvis replies. Prefer a compact English voice; mute/skip control; cancel speech when the operator starts talking or sends a new line.
- **UX:** mic permission + unsupported-browser faults in the existing FAULT row; recording indicator on the HUD ring/copy; keep keyboard Transmit.
- **Constraints:** HTTPS or localhost; Safari STT is weak/absent; OS voices will not sound cinematic. Good enough for a local desktop HUD.

No server audio upload in this phase. Express never hears the mic.

### Phase 2 — Cloud STT/TTS if browser quality is not enough

Only if Phase 1 recognition or voice quality is unacceptable:

- Browser `MediaRecorder` → `POST /api/voice/transcribe` (Whisper / Groq / similar) → existing `runtime.chat()`.
- Optional TTS endpoint or client fetch for a more “Jarvis” voice (provider TBD; extra API key).
- Keep the same UI contract: transcript in the log, then spoken reply.
- Gate behind env flags so API-key-only installs still work without voice cloud deps.

Do not invent an Anthropic audio route. Transcribe first, then call Claude as today.

### Phase 3 — Conversational voice (after streaming)

Depends on backlog P0 streaming chat:

- Stream tokens to the HUD and start TTS on sentence boundaries (not after the full JSON body).
- Barge-in: user speech cancels TTS and starts a new turn.
- Continuous listen is optional; default remains push-to-talk so Jarvis does not capture background audio.

Wake-word, always-on room listening, and agent-to-agent audio are out of scope.

### What not to do

- Do not add `/api/voice` that forwards raw audio to `messages.create`.
- Do not shell out to `claude /voice` or scrape `~/.claude` for dictation.
- Do not record or store operator audio on disk in v1 (privacy; single-user local app still should not keep wavs by default).
- Do not block Phase 1 on streaming, Docker, or extra providers.

### Implementation notes (Phase 1)

- Extract `sendChat(text)` from the `ChatPanel` form handler; mic and Send both call it.
- Feature-detect APIs; degrade to text-only with an explicit “voice unavailable” overline.
- Tests: unit-test the submit helper with a mocked `fetch`; skip real mic in Vitest. Manual check on Chrome localhost: grant mic, speak, hear reply, type a follow-up, confirm TTS cancels.

## P0 - Core reliability and capability

1. Persist memory and skill notes to durable storage (SQLite/Postgres/Redis).
2. Add streaming chat responses and partial token rendering.
3. Add stronger agent orchestration policy (routing, retries, fallback agent).
4. Add local backup/export for memory and skills data.
5. Add lightweight guardrails and validation policies for inter-agent messages.

## Recently completed

- Structured `SendMessage` envelopes with `priority`, `correlationId`, `taskId`, and `ttlMs`

## P1 - Better assistant experience

1. Add personality profiles (friend, coach, concise assistant).
2. Add conversation summaries to reduce context length.
3. Add planner-to-executor workflow where planner creates tasks for specialist agents.
4. Add task board UI (create, assign, status updates, done).
5. Add memory controls in UI (view/edit/delete stored facts).

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

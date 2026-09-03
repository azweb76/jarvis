import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { readClaudeSettings } from "../core/claude-auth.js";
import { AnthropicClaudeClient } from "../core/claude-client.js";
import { formatBackupFilename } from "../core/durable-store.js";
import { JarvisRuntime, MessagePolicyError } from "../core/jarvis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const isDev = process.env.NODE_ENV !== "production";

const app = express();
app.use(express.json());

const claudeClient = new AnthropicClaudeClient();
const runtime = new JarvisRuntime(claudeClient);

const sendRuntimeError = (res: express.Response, error: unknown) => {
  const message = (error as Error).message;
  if (error instanceof MessagePolicyError) {
    return res.status(400).json({ error: message, code: error.code });
  }
  if (typeof message === "string" && /invalid jarvis backup/i.test(message)) {
    return res.status(400).json({ error: message });
  }
  return res.status(500).json({ error: message });
};

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    const response = await runtime.chat(message);
    return res.json(response);
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

app.post("/api/agents/:agentId/tasks", async (req, res) => {
  try {
    const { agentId } = req.params;
    const title = String(req.body?.title ?? "").trim();
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!title || !prompt) {
      return res.status(400).json({ error: "title and prompt are required" });
    }
    const response = await runtime.assignTask(agentId, { title, prompt });
    return res.json(response);
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

app.get("/api/state", (_req, res) => {
  res.json(runtime.getState());
});

app.get("/api/auth", (_req, res) => {
  const auth = claudeClient.getAuthInfo();
  const settings = readClaudeSettings();
  res.json({
    ...auth,
    apiKeyHelperConfigured: Boolean(settings.apiKeyHelper),
    apiKeyHelperSourcePath: settings.apiKeyHelperSourcePath ?? null,
    configDirs: settings.configDirs,
    envOverridesHelper:
      auth.source === "ANTHROPIC_API_KEY" ||
      auth.source === "CLAUDE_CODE_OAUTH_TOKEN" ||
      auth.source === "ANTHROPIC_AUTH_TOKEN"
        ? Boolean(settings.apiKeyHelper)
        : false
  });
});

app.get("/api/agents/:agentId/messages", (req, res) => {
  try {
    const { agentId } = req.params;
    return res.json(runtime.getAgentMessages(agentId));
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

app.post("/api/agents/messages", (req, res) => {
  try {
    const fromAgentId = String(req.body?.fromAgentId ?? "").trim();
    const toAgentId = String(req.body?.toAgentId ?? "").trim();
    const content = String(req.body?.content ?? "");
    const priority = req.body?.priority as "low" | "normal" | "high" | undefined;
    const correlationId = req.body?.correlationId as string | undefined;
    const taskId = req.body?.taskId as string | undefined;
    const ttlMs = req.body?.ttlMs === undefined ? undefined : Number(req.body.ttlMs);
    runtime.sendAgentMessage(fromAgentId, toAgentId, content, {
      priority,
      correlationId,
      taskId,
      ttlMs
    });
    return res.json({ ok: true });
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

app.get("/api/data/export", (_req, res) => {
  const backup = runtime.exportBackup();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${formatBackupFilename(backup.exportedAt)}"`);
  return res.json(backup);
});

app.post("/api/data/backup", (_req, res) => {
  try {
    const result = runtime.writeLocalBackup();
    return res.json({ ok: true, path: result.path, backup: result.backup });
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

app.post("/api/data/import", (req, res) => {
  try {
    const payload = req.body?.backup ?? req.body;
    const backup = runtime.importBackup(payload);
    return res.json({ ok: true, backup });
  } catch (error) {
    return sendRuntimeError(res, error);
  }
});

const start = async () => {
  if (isDev) {
    const vite = await createViteServer({
      configFile: path.join(rootDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(rootDir, "dist/client")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(rootDir, "dist/client/index.html"));
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Jarvis running on http://localhost:${port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

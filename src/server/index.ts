import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { AnthropicClaudeClient } from "../core/claude-client.js";
import { JarvisRuntime } from "../core/jarvis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const isDev = process.env.NODE_ENV !== "production";

const app = express();
app.use(express.json());

const claudeClient = new AnthropicClaudeClient();
const runtime = new JarvisRuntime(claudeClient);

app.post("/api/chat", async (req, res) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }
    const response = await runtime.chat(message);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
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
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/state", (_req, res) => {
  res.json(runtime.getState());
});

app.get("/api/auth", (_req, res) => {
  res.json(claudeClient.getAuthInfo());
});

app.get("/api/agents/:agentId/messages", (req, res) => {
  try {
    const { agentId } = req.params;
    return res.json(runtime.getAgentMessages(agentId));
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/agents/messages", (req, res) => {
  try {
    const fromAgentId = String(req.body?.fromAgentId ?? "").trim();
    const toAgentId = String(req.body?.toAgentId ?? "").trim();
    const content = String(req.body?.content ?? "").trim();
    const priority = req.body?.priority as "low" | "normal" | "high" | undefined;
    const correlationId = req.body?.correlationId as string | undefined;
    const taskId = req.body?.taskId as string | undefined;
    const ttlMs = Number(req.body?.ttlMs);
    if (!fromAgentId || !toAgentId || !content) {
      return res.status(400).json({ error: "fromAgentId, toAgentId, and content are required" });
    }
    runtime.sendAgentMessage(fromAgentId, toAgentId, content, {
      priority,
      correlationId,
      taskId,
      ttlMs: Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : undefined
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
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

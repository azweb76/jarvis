import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { readClaudeSettings } from "../core/claude-auth.js";
import { AnthropicClaudeClient } from "../core/claude-client.js";
import { formatBackupFilename } from "../core/durable-store.js";
import { GithubError } from "../core/github.js";
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
  if (error instanceof GithubError) {
    const status =
      error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: message, code: error.code });
  }
  if (typeof message === "string" && /invalid jarvis backup/i.test(message)) {
    return res.status(400).json({ error: message });
  }
  return res.status(500).json({ error: message });
};

const bindAbort = (req: express.Request): AbortSignal => {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on("close", onClose);
  return controller.signal;
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

app.get("/api/projects", (_req, res) => {
  res.json({ projects: runtime.listProjects() });
});

app.get("/api/projects/:sessionId", (req, res) => {
  try {
    return res.json(runtime.getProject(req.params.sessionId));
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const repoPath = String(req.body?.repoPath ?? "").trim();
    const goal = String(req.body?.goal ?? "").trim();
    const branch = req.body?.branch ? String(req.body.branch).trim() : undefined;
    const maxLoops = Number(req.body?.maxLoops);
    if (!repoPath || !goal) {
      return res.status(400).json({ error: "repoPath and goal are required" });
    }
    const session = await runtime.startProject({
      repoPath,
      goal,
      branch,
      maxLoops: Number.isFinite(maxLoops) && maxLoops > 0 ? maxLoops : undefined
    });
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/projects/:sessionId/advance", async (req, res) => {
  try {
    const session = await runtime.advanceProject(req.params.sessionId);
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/projects/:sessionId/loop", async (req, res) => {
  try {
    const session = await runtime.loopProject(req.params.sessionId);
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/projects/:sessionId/commit", async (req, res) => {
  try {
    const message = req.body?.message ? String(req.body.message).trim() : undefined;
    const result = await runtime.commitProject(req.params.sessionId, message);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/git/worktrees", async (req, res) => {
  try {
    const repoPath = String(req.query.repoPath ?? "").trim();
    if (!repoPath) {
      return res.status(400).json({ error: "repoPath query param is required" });
    }
    const inspection = await runtime.inspectProjectRepo(repoPath);
    return res.json(inspection);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/github/status", (_req, res) => {
  res.json(runtime.githubStatus());
});

app.get("/api/github/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      return res.status(400).json({ error: "q query param is required" });
    }
    const perPage = Number(req.query.perPage);
    const signal = bindAbort(req);
    const result = await runtime.searchGithubRepos(q, {
      perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : undefined,
      signal
    });
    return res.json(result);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return res.status(499).json({ error: "client disconnected" });
    }
    return sendRuntimeError(res, error);
  }
});

app.get("/api/github/repos/:owner/:repo", async (req, res) => {
  try {
    const fullName = `${req.params.owner}/${req.params.repo}`;
    const signal = bindAbort(req);
    const repo = await runtime.lookupGithubRepo(fullName, { signal });
    return res.json(repo);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return res.status(499).json({ error: "client disconnected" });
    }
    return sendRuntimeError(res, error);
  }
});

app.get("/api/github/cloned", (_req, res) => {
  res.json({ repos: runtime.listClonedGithubRepos(), ...runtime.githubStatus() });
});

app.post("/api/github/clone", async (req, res) => {
  try {
    const fullName = req.body?.fullName ? String(req.body.fullName).trim() : undefined;
    const cloneUrl = req.body?.cloneUrl ? String(req.body.cloneUrl).trim() : undefined;
    const destination = req.body?.destination
      ? String(req.body.destination).trim()
      : undefined;
    if (!fullName && !cloneUrl) {
      return res.status(400).json({ error: "fullName or cloneUrl is required" });
    }
    const result = await runtime.cloneGithubRepo({ fullName, cloneUrl, destination });
    return res.json(result);
  } catch (error) {
    return sendRuntimeError(res, error);
  }
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

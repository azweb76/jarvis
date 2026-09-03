import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { HudPanel } from "./HudPanel";

interface ProjectSession {
  id: string;
  goal: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  phase: string;
  loopCount: number;
  maxLoops: number;
  advice: string;
  plan: string;
  implementationNotes: string;
  suggestedCommitMessage: string;
  appliedFiles: Array<{ path: string; action: string }>;
  verification: {
    passed: boolean;
    command: string;
    notes: string;
  } | null;
  log: Array<{ phase: string; summary: string; at: number }>;
}

const phases = ["brainstorm", "plan", "implement", "verify", "loop", "done"] as const;

export function ProjectPanel() {
  const [repoPath, setRepoPath] = useState("");
  const [goal, setGoal] = useState("");
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/projects");
    const data = (await response.json()) as { projects: ProjectSession[] };
    setSessions(data.projects ?? []);
    if (session) {
      const latest = data.projects.find((item) => item.id === session.id);
      if (latest) setSession(latest);
    }
  }, [session]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onStart = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoPath: repoPath.trim(), goal: goal.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to start project workshop");
      setSession(data as ProjectSession);
      setNote("Brainstorm and plan ready. Advance to implement in the worktree.");
    });
  };

  const onAdvance = async () => {
    if (!session) return;
    await run(async () => {
      const response = await fetch(`/api/projects/${session.id}/advance`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Advance failed");
      setSession(data as ProjectSession);
      setNote(`Moved to phase: ${(data as ProjectSession).phase}`);
    });
  };

  const onLoop = async () => {
    if (!session) return;
    await run(async () => {
      const response = await fetch(`/api/projects/${session.id}/loop`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Loop failed");
      setSession(data as ProjectSession);
      setNote("Ran implement → verify loop until pass or max loops.");
    });
  };

  const onCommit = async () => {
    if (!session) return;
    await run(async () => {
      const response = await fetch(`/api/projects/${session.id}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Commit failed");
      setSession(data.session as ProjectSession);
      setNote(String(data.result ?? "Committed"));
    });
  };

  return (
    <HudPanel title="Project workshop" code="PJ-01" delayMs={220}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Brainstorm → plan → implement in a git worktree → verify → loop when needed.
        </Typography>
        <Box component="form" onSubmit={onStart}>
          <Stack spacing={2}>
            <TextField
              label="Repo path"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              disabled={busy}
              required
              fullWidth
              size="small"
              placeholder="/path/to/project"
            />
            <TextField
              label="Goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              disabled={busy}
              required
              fullWidth
              multiline
              minRows={2}
              size="small"
              placeholder="Advise and implement a focused change"
            />
            <Button
              type="submit"
              variant="outlined"
              startIcon={<AccountTreeOutlinedIcon />}
              disabled={busy || !repoPath.trim() || !goal.trim()}
            >
              {busy ? "Spinning worktree…" : "Start workshop"}
            </Button>
          </Stack>
        </Box>

        {session ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              {phases.map((phase) => (
                <Chip
                  key={phase}
                  size="small"
                  label={phase}
                  color={session.phase === phase ? "primary" : "default"}
                  variant={session.phase === phase ? "filled" : "outlined"}
                />
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {session.branch} · loops {session.loopCount}/{session.maxLoops}
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: '"Share Tech Mono", monospace' }}>
              {session.worktreePath}
            </Typography>
            {session.advice ? (
              <Detail label="Advice" text={session.advice} />
            ) : null}
            {session.plan ? <Detail label="Plan" text={session.plan} /> : null}
            {session.implementationNotes ? (
              <Detail label="Implement" text={session.implementationNotes} />
            ) : null}
            {session.verification ? (
              <Detail
                label={session.verification.passed ? "Verify · pass" : "Verify · fail"}
                text={`${session.verification.command}\n${session.verification.notes}`}
              />
            ) : null}
            {session.appliedFiles.length > 0 ? (
              <Typography variant="body2" color="text.secondary">
                Files: {session.appliedFiles.map((file) => `${file.action}:${file.path}`).join(", ")}
              </Typography>
            ) : null}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button variant="contained" onClick={() => void onAdvance()} disabled={busy || session.phase === "done"}>
                Advance
              </Button>
              <Button variant="outlined" onClick={() => void onLoop()} disabled={busy || session.phase === "done"}>
                Loop
              </Button>
              <Button variant="outlined" onClick={() => void onCommit()} disabled={busy}>
                Commit worktree
              </Button>
            </Stack>
          </Stack>
        ) : null}

        {sessions.length > 0 && !session ? (
          <Stack spacing={1}>
            <Typography variant="overline" color="text.secondary">
              Recent sessions
            </Typography>
            {sessions.slice(0, 4).map((item) => (
              <Button
                key={item.id}
                size="small"
                onClick={() => setSession(item)}
                sx={{ justifyContent: "flex-start", textTransform: "none" }}
              >
                {item.phase} · {item.goal.slice(0, 48)}
              </Button>
            ))}
          </Stack>
        ) : null}

        {error ? (
          <Typography color="error" variant="body2">
            FAULT · {error}
          </Typography>
        ) : null}
        {note ? (
          <Typography variant="body2" color="primary.main">
            {note}
          </Typography>
        ) : null}
      </Stack>
    </HudPanel>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <Box
      sx={[
        {
          p: 1.5,
          border: "1px solid",
          borderColor: "divider",
          background: "rgba(10,126,164,0.06)"
        },
        (theme) =>
          theme.applyStyles("dark", {
            background: "rgba(61,224,255,0.06)"
          })
      ]}
    >
      <Typography variant="overline" color="primary" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ whiteSpace: "pre-wrap", fontFamily: '"Share Tech Mono", monospace' }}
      >
        {text.slice(0, 900)}
      </Typography>
    </Box>
  );
}

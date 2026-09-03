import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormEvent, useState } from "react";
import { HudPanel } from "./HudPanel";

const agents = [
  { id: "planner", label: "Planner" },
  { id: "memory", label: "Memory" },
  { id: "greeter", label: "Greeter" }
];

export function TaskPanel() {
  const [agentId, setAgentId] = useState("planner");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setOutput(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), prompt: prompt.trim() })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Task assignment failed");
      }
      setOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HudPanel title="Agent ops" code="AG-02" delayMs={180}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Dispatch a directive to a specialist node.
        </Typography>
        <Box component="form" onSubmit={onSubmit}>
          <Stack spacing={2}>
            <TextField
              select
              label="Agent node"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              disabled={busy}
              fullWidth
              size="small"
            >
              {agents.map((agent) => (
                <MenuItem key={agent.id} value={agent.id}>
                  {agent.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Directive title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Directive payload"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={busy}
              required
              fullWidth
              multiline
              minRows={3}
              size="small"
            />
            <Button
              type="submit"
              variant="outlined"
              startIcon={<AssignmentIndOutlinedIcon />}
              disabled={busy || !title.trim() || !prompt.trim()}
            >
              {busy ? "Routing…" : "Assign"}
            </Button>
          </Stack>
        </Box>
        {error ? (
          <Typography color="error" variant="body2">
            FAULT · {error}
          </Typography>
        ) : null}
        {output ? (
          <Box
            component="pre"
            sx={[
              {
                m: 0,
                p: 2,
                overflowX: "auto",
                border: "1px solid",
                borderColor: "divider",
                typography: "body2",
                fontFamily: '"Share Tech Mono", monospace',
                color: "primary.dark",
                animation: "hudFadeUp 0.4s ease both",
                background: "rgba(10,126,164,0.06)"
              },
              (theme) =>
                theme.applyStyles("dark", {
                  color: "primary.light",
                  background: "rgba(61,224,255,0.06)"
                })
            ]}
          >
            {output}
          </Box>
        ) : null}
      </Stack>
    </HudPanel>
  );
}

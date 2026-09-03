import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormEvent, useState } from "react";

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
    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Stack spacing={2}>
        <Typography variant="h6">Assign Agent Task</Typography>
        <Box component="form" onSubmit={onSubmit}>
          <Stack spacing={2}>
            <TextField
              select
              label="Agent"
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
              label="Task title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Task prompt"
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
              Assign
            </Button>
          </Stack>
        </Box>
        {error ? (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        ) : null}
        {output ? (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              overflowX: "auto",
              borderRadius: 1,
              bgcolor: "action.hover",
              typography: "body2",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
            }}
          >
            {output}
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}

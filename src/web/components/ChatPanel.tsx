import SendIcon from "@mui/icons-material/Send";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormEvent, useState } from "react";

interface ChatLine {
  role: "You" | "Jarvis";
  text: string;
}

export function ChatPanel() {
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    setMessage("");
    setLines((prev) => [...prev, { role: "You", text: trimmed }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Chat request failed");
      }
      setLines((prev) => [
        ...prev,
        { role: "Jarvis", text: data.text ?? "No response" }
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Typography variant="h6">Chat</Typography>
        <Box
          sx={{
            flex: 1,
            minHeight: 240,
            maxHeight: 420,
            overflowY: "auto",
            borderRadius: 1,
            bgcolor: "action.hover",
            p: 2
          }}
        >
          {lines.length === 0 ? (
            <Typography color="text.secondary">
              Say hi to Jarvis to start a conversation.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {lines.map((line, index) => (
                <Box key={`${line.role}-${index}`}>
                  <Typography variant="caption" color="text.secondary">
                    {line.role}
                  </Typography>
                  <Typography>{line.text}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
        {error ? (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        ) : null}
        <Box component="form" onSubmit={onSubmit}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Message"
              placeholder="Say hi to Jarvis..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={busy}
              required
            />
            <Button
              type="submit"
              variant="contained"
              endIcon={<SendIcon />}
              disabled={busy || !message.trim()}
              sx={{ flexShrink: 0 }}
            >
              Send
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

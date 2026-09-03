import SendIcon from "@mui/icons-material/Send";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormEvent, useEffect, useRef, useState } from "react";
import { HudPanel } from "./HudPanel";

interface ChatLine {
  role: "You" | "Jarvis";
  text: string;
}

export function ChatPanel() {
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

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
    <HudPanel title="Voice link" code="CH-01" delayMs={80}>
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Box
          ref={logRef}
          sx={[
            {
              flex: "1 1 auto",
              minHeight: { xs: 180, md: 240 },
              maxHeight: { xs: 320, md: 420 },
              overflowY: "auto",
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              background:
                "linear-gradient(180deg, rgba(10,126,164,0.06), rgba(255,255,255,0.2))",
              fontFamily: '"Share Tech Mono", monospace'
            },
            (theme) =>
              theme.applyStyles("dark", {
                background:
                  "linear-gradient(180deg, rgba(61,224,255,0.05), rgba(0,0,0,0.25))"
              })
          ]}
        >
          {lines.length === 0 && !busy ? (
            <Typography color="text.secondary" variant="body2">
              Awaiting input · address Jarvis directly
            </Typography>
          ) : (
            <Stack spacing={1.75}>
              {lines.map((line, index) => (
                <Box
                  key={`${line.role}-${index}`}
                  sx={{
                    animation: "hudFadeUp 0.35s ease both"
                  }}
                >
                  <Typography
                    variant="overline"
                    color={line.role === "Jarvis" ? "primary" : "text.secondary"}
                    sx={{ display: "block", lineHeight: 1.2 }}
                  >
                    {line.role === "Jarvis" ? "JARVIS" : "OPERATOR"}
                  </Typography>
                  <Typography sx={{ mt: 0.4 }}>{line.text}</Typography>
                </Box>
              ))}
              {busy ? (
                <Typography
                  variant="overline"
                  color="primary"
                  sx={{ animation: "hudBlink 1s step-end infinite" }}
                >
                  Jarvis is composing…
                </Typography>
              ) : null}
            </Stack>
          )}
        </Box>
        {error ? (
          <Typography color="error" variant="body2">
            FAULT · {error}
          </Typography>
        ) : null}
        <Box component="form" onSubmit={onSubmit}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Transmit"
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
              sx={{ flexShrink: 0, px: 2.5 }}
            >
              Send
            </Button>
          </Stack>
        </Box>
      </Stack>
    </HudPanel>
  );
}

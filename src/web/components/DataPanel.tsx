import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ChangeEvent, useRef, useState } from "react";
import { HudPanel } from "./HudPanel";

export function DataPanel() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setStatus(await work());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onExport = () =>
    run(async () => {
      const response = await fetch("/api/data/export");
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "jarvis-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      return "Archive packet downloaded.";
    });

  const onLocalBackup = () =>
    run(async () => {
      const response = await fetch("/api/data/backup", { method: "POST" });
      const data = (await response.json()) as { error?: string; path?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Local backup failed");
      }
      return `Local copy written · ${data.path}`;
    });

  const onImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void run(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text()) as unknown;
      } catch {
        throw new Error("File is not valid JSON");
      }
      const response = await fetch("/api/data/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Restore failed");
      }
      return `Restored from ${file.name}`;
    });
  };

  return (
    <HudPanel title="Memory archive" code="AR-03" delayMs={240}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Export, snapshot, or restore durable memory and skill notes.
        </Typography>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImportFile}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            disabled={busy}
            onClick={() => void onExport()}
          >
            Download JSON
          </Button>
          <Button
            variant="outlined"
            startIcon={<ArchiveOutlinedIcon />}
            disabled={busy}
            onClick={() => void onLocalBackup()}
          >
            Write local backup
          </Button>
          <Button
            variant="contained"
            startIcon={<FileUploadOutlinedIcon />}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Restore from file
          </Button>
        </Stack>
        {error ? (
          <Typography color="error" variant="body2">
            FAULT · {error}
          </Typography>
        ) : null}
        {status ? (
          <Box
            sx={[
              {
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                typography: "body2",
                fontFamily: '"Share Tech Mono", monospace',
                animation: "hudFadeUp 0.4s ease both",
                background: "rgba(10,126,164,0.06)",
                wordBreak: "break-all"
              },
              (theme) =>
                theme.applyStyles("dark", {
                  background: "rgba(61,224,255,0.06)"
                })
            ]}
          >
            {status}
          </Box>
        ) : null}
      </Stack>
    </HudPanel>
  );
}

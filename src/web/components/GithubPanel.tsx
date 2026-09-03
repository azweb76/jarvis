import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { HudPanel } from "./HudPanel";

interface GithubRepo {
  id: number;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stars: number;
  private: boolean;
  updatedAt: string;
}

interface GithubStatus {
  configured: boolean;
  reposDir: string;
}

interface GithubPanelProps {
  onRepoPath?: (repoPath: string) => void;
}

const SEARCH_DEBOUNCE_MS = 140;

export function GithubPanel({ onRepoPath }: GithubPanelProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<GithubRepo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cached, setCached] = useState(false);
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [cloning, setCloning] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    void fetch("/api/github/status")
      .then(async (response) => {
        const data = (await response.json()) as GithubStatus;
        setStatus(data);
      })
      .catch(() => setStatus({ configured: false, reposDir: "" }));
  }, []);

  useEffect(() => {
    const q = deferredQuery.trim();
    if (!q) {
      abortRef.current?.abort();
      setResults([]);
      setTotalCount(0);
      setCached(false);
      setSearching(false);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      setSearching(true);
      setError(null);

      void fetch(`/api/github/search?q=${encodeURIComponent(q)}&perPage=8`, {
        signal: controller.signal
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error ?? "GitHub search failed");
          }
          if (requestId !== requestIdRef.current) return;
          startTransition(() => {
            setResults((data.items ?? []) as GithubRepo[]);
            setTotalCount(Number(data.totalCount ?? 0));
            setCached(Boolean(data.cached));
          });
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          if (requestId !== requestIdRef.current) return;
          setError((err as Error).message);
          setResults([]);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [deferredQuery]);

  const onClone = async (fullName: string) => {
    setCloning(fullName);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/github/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Clone failed");
      }
      const repoPath = String(data.path);
      onRepoPath?.(repoPath);
      setNote(
        data.alreadyExisted
          ? `Ready · ${fullName} already at ${repoPath}`
          : `Cloned · ${fullName} → ${repoPath}`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCloning(null);
    }
  };

  return (
    <HudPanel title="GitHub repos" code="GH-01" delayMs={160}>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Search GitHub and clone into the local repos dir for the project workshop.
        </Typography>
        {status && !status.configured ? (
          <Typography color="error" variant="body2">
            FAULT · GITHUB_TOKEN is not set
          </Typography>
        ) : null}
        <TextField
          label="Search repositories"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
          size="small"
          placeholder="owner/name, language:ts stars:>100…"
          disabled={status?.configured === false}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {searching ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}
              </InputAdornment>
            )
          }}
        />
        {query.trim() ? (
          <Typography variant="overline" color="text.secondary">
            {searching
              ? "Scanning…"
              : `${totalCount.toLocaleString()} hits${cached ? " · cache" : ""}`}
          </Typography>
        ) : null}

        <Stack spacing={1.25} sx={{ maxHeight: 320, overflowY: "auto" }}>
          {results.map((repo) => (
            <Box
              key={repo.id}
              sx={[
                {
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  background: "rgba(10,126,164,0.05)",
                  animation: "hudFadeUp 0.28s ease both"
                },
                (theme) =>
                  theme.applyStyles("dark", {
                    background: "rgba(61,224,255,0.05)"
                  })
              ]}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.25}
                sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    component="a"
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    variant="body2"
                    sx={{
                      color: "primary.main",
                      textDecoration: "none",
                      fontFamily: '"Share Tech Mono", monospace',
                      wordBreak: "break-all"
                    }}
                  >
                    {repo.fullName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    ★ {repo.stars.toLocaleString()}
                    {repo.language ? ` · ${repo.language}` : ""}
                    {repo.private ? " · private" : ""}
                  </Typography>
                  {repo.description ? (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {repo.description.slice(0, 140)}
                    </Typography>
                  ) : null}
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloudDownloadOutlinedIcon />}
                  disabled={Boolean(cloning) || status?.configured === false}
                  onClick={() => void onClone(repo.fullName)}
                  sx={{ flexShrink: 0 }}
                >
                  {cloning === repo.fullName ? "Cloning…" : "Clone"}
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>

        {status?.reposDir ? (
          <Typography variant="overline" color="text.secondary">
            Repos dir · {status.reposDir}
          </Typography>
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

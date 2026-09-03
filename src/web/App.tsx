import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { DataPanel } from "./components/DataPanel";
import { GithubPanel } from "./components/GithubPanel";
import { HudShell } from "./components/HudShell";
import { ProjectPanel } from "./components/ProjectPanel";
import { TaskPanel } from "./components/TaskPanel";

export function App() {
  const [repoPath, setRepoPath] = useState("");

  return (
    <HudShell>
      <Container
        maxWidth="lg"
        sx={{
          px: { xs: 2.5, sm: 3, md: 4 },
          pb: { xs: 5, md: 6 },
          boxSizing: "border-box"
        }}
      >
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }} sx={{ display: "flex" }}>
            <ChatPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }} sx={{ display: "flex" }}>
            <TaskPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
            <GithubPanel onRepoPath={setRepoPath} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: "flex" }}>
            <ProjectPanel repoPath={repoPath} onRepoPathChange={setRepoPath} />
          </Grid>
          <Grid size={{ xs: 12 }} sx={{ display: "flex" }}>
            <DataPanel />
          </Grid>
        </Grid>
        <Box
          sx={{
            mt: 3,
            pt: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap"
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Nodes · greeter / memory / brainstorm / planner / implementer / verifier
          </Typography>
          <Typography variant="overline" color="primary.main">
            Ready for directive
          </Typography>
        </Box>
      </Container>
    </HudShell>
  );
}

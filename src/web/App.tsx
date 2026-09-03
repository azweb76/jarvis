import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ChatPanel } from "./components/ChatPanel";
import { HudShell } from "./components/HudShell";
import { TaskPanel } from "./components/TaskPanel";

export function App() {
  return (
    <HudShell>
      <Container maxWidth="lg" sx={{ px: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1, sm: 3 }}
          sx={{ mb: 2.5, opacity: 0.85 }}
        >
          <Typography variant="overline" color="text.secondary">
            Nodes · greeter / memory / planner
          </Typography>
          <Typography variant="overline" color="text.secondary">
            Channel · encrypted local runtime
          </Typography>
        </Stack>
        <Grid container spacing={2.5} alignItems="stretch">
          <Grid size={{ xs: 12, md: 7 }}>
            <ChatPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TaskPanel />
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
            Status · nominal
          </Typography>
          <Typography variant="overline" color="primary.main">
            Ready for directive
          </Typography>
        </Box>
      </Container>
    </HudShell>
  );
}

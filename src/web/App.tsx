import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { ChatPanel } from "./components/ChatPanel";
import { ColorModeToggle } from "./components/ColorModeToggle";
import { TaskPanel } from "./components/TaskPanel";

export function App() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Jarvis
          </Typography>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Typography variant="h4" gutterBottom>
          Personal assistant
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 56 * 8 }}>
          Chat with Jarvis and assign work to planner, memory, and greeter agents.
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <ChatPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TaskPanel />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

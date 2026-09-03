import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { ColorModeToggle } from "./ColorModeToggle";
import { HudAtmosphere } from "./HudAtmosphere";

export function HudHeader() {
  return (
    <Box
      component="header"
      sx={{
        position: "relative",
        zIndex: 2,
        px: { xs: 2, md: 4 },
        pt: { xs: 2.5, md: 3.5 },
        pb: { xs: 2, md: 2.5 }
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        spacing={2}
      >
        <Box sx={{ animation: "hudFadeUp 0.6s ease both" }}>
          <Typography
            variant="overline"
            color="primary"
            sx={{ display: "block", mb: 0.5, animation: "hudBlink 2.8s ease infinite" }}
          >
            System online · multi-agent
          </Typography>
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: "2.4rem", sm: "3.4rem", md: "4.2rem" },
              lineHeight: 1,
              color: "primary.main"
            }}
          >
            Jarvis
          </Typography>
          <Typography
            sx={{
              mt: 1.25,
              maxWidth: 420,
              color: "text.secondary",
              fontSize: { xs: "1rem", md: "1.1rem" }
            }}
          >
            Personal assistant interface. Speak freely, then route work to specialist agents.
          </Typography>
        </Box>
        <Stack alignItems="flex-end" spacing={1} sx={{ pt: 0.5 }}>
          <ColorModeToggle />
          <Typography variant="overline" color="text.secondary">
            {new Date().toISOString().slice(0, 10)}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

export function HudShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ position: "relative", minHeight: "100vh" }}>
      <HudAtmosphere />
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <HudHeader />
        {children}
      </Box>
    </Box>
  );
}

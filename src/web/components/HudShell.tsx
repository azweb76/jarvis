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
        spacing={2}
        sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
      >
        <Box sx={{ flex: "1 1 auto", minWidth: 0, animation: "hudFadeUp 0.6s ease both" }}>
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
              fontSize: { xs: "2.2rem", sm: "3.2rem", md: "3.8rem" },
              lineHeight: 1.05,
              letterSpacing: { xs: "0.1em", md: "0.14em" },
              pr: "0.14em",
              color: "primary.main",
              overflow: "visible"
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
        <Stack spacing={1} sx={{ alignItems: "flex-end", pt: 0.5, flexShrink: 0 }}>
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
    <Box sx={{ position: "relative", minHeight: "100vh", overflow: "visible" }}>
      <HudAtmosphere />
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <HudHeader />
        {children}
      </Box>
    </Box>
  );
}

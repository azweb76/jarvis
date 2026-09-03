import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface HudPanelProps {
  title: string;
  code: string;
  children: ReactNode;
  delayMs?: number;
}

export function HudPanel({ title, code, children, delayMs = 0 }: HudPanelProps) {
  return (
    <Box
      sx={[
        {
          position: "relative",
          height: "100%",
          overflow: "visible",
          p: { xs: 2.25, md: 2.75 },
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          backdropFilter: "blur(10px)",
          animation: "hudFadeUp 0.7s ease both",
          animationDelay: `${delayMs}ms`,
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            width: 16,
            height: 16,
            pointerEvents: "none"
          },
          "&::before": {
            top: -1,
            left: -1,
            borderTop: "2px solid",
            borderLeft: "2px solid",
            borderColor: "primary.main"
          },
          "&::after": {
            right: -1,
            bottom: -1,
            borderRight: "2px solid",
            borderBottom: "2px solid",
            borderColor: "primary.main"
          }
        },
        (theme) =>
          theme.applyStyles("dark", {
            boxShadow: "inset 0 0 0 1px rgba(61, 224, 255, 0.08)"
          })
      ]}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 2, alignItems: "baseline", justifyContent: "space-between" }}
      >
        <Typography variant="h6" sx={{ fontSize: "0.95rem" }}>
          {title}
        </Typography>
        <Typography
          variant="overline"
          color="primary"
          sx={{ lineHeight: 1, opacity: 0.85, flexShrink: 0 }}
        >
          {code}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

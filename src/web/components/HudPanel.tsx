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

function Corner({
  top,
  left,
  right,
  bottom
}: {
  top?: boolean;
  left?: boolean;
  right?: boolean;
  bottom?: boolean;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        width: 14,
        height: 14,
        top: top ? -1 : "auto",
        bottom: bottom ? -1 : "auto",
        left: left ? -1 : "auto",
        right: right ? -1 : "auto",
        borderTop: top ? "2px solid" : "none",
        borderBottom: bottom ? "2px solid" : "none",
        borderLeft: left ? "2px solid" : "none",
        borderRight: right ? "2px solid" : "none",
        borderColor: "primary.main",
        pointerEvents: "none"
      }}
    />
  );
}

export function HudPanel({ title, code, children, delayMs = 0 }: HudPanelProps) {
  return (
    <Box
      sx={[
        {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          width: "100%",
          minHeight: 0,
          overflow: "visible",
          p: { xs: 2.25, md: 2.75 },
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          backdropFilter: "blur(10px)",
          animation: "hudFadeUp 0.7s ease both",
          animationDelay: `${delayMs}ms`
        },
        (theme) =>
          theme.applyStyles("dark", {
            boxShadow: "inset 0 0 0 1px rgba(61, 224, 255, 0.08)"
          })
      ]}
    >
      <Corner top left />
      <Corner top right />
      <Corner bottom left />
      <Corner bottom right />
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
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

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
          p: { xs: 2, md: 2.5 },
          clipPath:
            "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
          animation: "hudFadeUp 0.7s ease both",
          animationDelay: `${delayMs}ms`,
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            right: 0,
            width: 18,
            height: 18,
            borderTop: "2px solid",
            borderRight: "2px solid",
            borderColor: "primary.main"
          },
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            bottom: 0,
            width: 18,
            height: 18,
            borderBottom: "2px solid",
            borderLeft: "2px solid",
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
        alignItems="baseline"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Typography variant="h6" sx={{ fontSize: "0.95rem" }}>
          {title}
        </Typography>
        <Typography
          variant="overline"
          color="primary"
          sx={{ lineHeight: 1, opacity: 0.85 }}
        >
          {code}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

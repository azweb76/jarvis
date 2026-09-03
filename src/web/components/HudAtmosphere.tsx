import Box from "@mui/material/Box";

export function HudAtmosphere() {
  return (
    <Box
      aria-hidden
      sx={[
        {
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
          background: `
            radial-gradient(ellipse 70% 50% at 50% -10%, rgba(10, 126, 164, 0.18), transparent 55%),
            radial-gradient(ellipse 45% 40% at 85% 70%, rgba(196, 92, 38, 0.08), transparent 50%),
            linear-gradient(180deg, #E8F2F8 0%, #D7E6EF 55%, #C9DCE8 100%)
          `
        },
        (theme) =>
          theme.applyStyles("dark", {
            background: `
              radial-gradient(ellipse 70% 50% at 50% -10%, rgba(61, 224, 255, 0.16), transparent 55%),
              radial-gradient(ellipse 45% 40% at 85% 70%, rgba(240, 163, 94, 0.08), transparent 50%),
              radial-gradient(ellipse 40% 35% at 10% 80%, rgba(20, 168, 200, 0.1), transparent 45%),
              linear-gradient(180deg, #040B12 0%, #071521 50%, #040B12 100%)
            `
          })
      ]}
    >
      <Box
        sx={[
          {
            position: "absolute",
            inset: 0,
            opacity: 0.4,
            backgroundImage: `
              linear-gradient(rgba(10,126,164,0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(10,126,164,0.08) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at center, black 20%, transparent 75%)"
          },
          (theme) =>
            theme.applyStyles("dark", {
              backgroundImage: `
                linear-gradient(rgba(61,224,255,0.07) 1px, transparent 1px),
                linear-gradient(90deg, rgba(61,224,255,0.07) 1px, transparent 1px)
              `
            })
        ]}
      />
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "42%",
          width: { xs: 220, md: 340 },
          height: { xs: 220, md: 340 },
          ml: { xs: "-110px", md: "-170px" },
          mt: { xs: "-110px", md: "-170px" },
          borderRadius: "50%",
          border: "1px solid",
          borderColor: "divider",
          animation: "hudPulse 4.5s ease-in-out infinite",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 28,
            borderRadius: "50%",
            border: "1px dashed",
            borderColor: "primary.main",
            opacity: 0.45,
            animation: "hudRingSpin 28s linear infinite"
          },
          "&::after": {
            content: '""',
            position: "absolute",
            inset: 56,
            borderRadius: "50%",
            border: "2px solid",
            borderColor: "primary.main",
            opacity: 0.35
          }
        }}
      />
      <Box
        sx={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            height: 120,
            background:
              "linear-gradient(180deg, transparent, rgba(10,126,164,0.08), transparent)",
            animation: "hudScan 9s linear infinite"
          },
          (theme) =>
            theme.applyStyles("dark", {
              background:
                "linear-gradient(180deg, transparent, rgba(61,224,255,0.06), transparent)"
            })
        ]}
      />
    </Box>
  );
}

import { createTheme } from "@mui/material/styles";

const sharedTypography = {
  fontFamily: '"Rajdhani", "Segoe UI", sans-serif',
  h1: {
    fontFamily: '"Orbitron", "Rajdhani", sans-serif',
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const
  },
  h2: {
    fontFamily: '"Orbitron", "Rajdhani", sans-serif',
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const
  },
  h6: {
    fontFamily: '"Orbitron", "Rajdhani", sans-serif',
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const
  },
  overline: {
    fontFamily: '"Share Tech Mono", monospace',
    letterSpacing: "0.22em"
  },
  button: {
    fontFamily: '"Orbitron", "Rajdhani", sans-serif',
    fontWeight: 600,
    letterSpacing: "0.12em"
  },
  body1: {
    fontSize: "1.05rem",
    letterSpacing: "0.02em"
  },
  body2: {
    fontFamily: '"Share Tech Mono", monospace',
    letterSpacing: "0.03em"
  }
};

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data"
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#0A7EA4",
          light: "#2BB7D8",
          dark: "#065A78",
          contrastText: "#F4FBFF"
        },
        secondary: {
          main: "#C45C26",
          contrastText: "#FFF8F2"
        },
        background: {
          default: "#D7E6EF",
          paper: "rgba(244, 250, 255, 0.78)"
        },
        text: {
          primary: "#0B1C28",
          secondary: "#355468"
        },
        divider: "rgba(10, 126, 164, 0.28)",
        error: {
          main: "#B42318"
        },
        success: {
          main: "#0F7B5B"
        }
      }
    },
    dark: {
      palette: {
        primary: {
          main: "#3DE0FF",
          light: "#7AEEFF",
          dark: "#14A8C8",
          contrastText: "#021018"
        },
        secondary: {
          main: "#F0A35E",
          contrastText: "#1A0E04"
        },
        background: {
          default: "#040B12",
          paper: "rgba(8, 22, 34, 0.72)"
        },
        text: {
          primary: "#E8F7FF",
          secondary: "#8FB6C9"
        },
        divider: "rgba(61, 224, 255, 0.22)",
        error: {
          main: "#FF6B6B"
        },
        success: {
          main: "#3DFFB5"
        }
      }
    }
  },
  typography: sharedTypography,
  shape: {
    borderRadius: 2
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "@keyframes hudPulse": {
          "0%, 100%": { opacity: 0.55, transform: "scale(1)" },
          "50%": { opacity: 1, transform: "scale(1.04)" }
        },
        "@keyframes hudScan": {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(120vh)" }
        },
        "@keyframes hudRingSpin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        "@keyframes hudFadeUp": {
          from: { opacity: 0, transform: "translateY(12px)" },
          to: { opacity: 1, transform: "translateY(0)" }
        },
        "@keyframes hudBlink": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 }
        },
        body: {
          minHeight: "100vh"
        },
        "::selection": {
          background: "rgba(61, 224, 255, 0.35)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          textTransform: "uppercase",
          minHeight: 42
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none"
          }
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined"
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          fontFamily: '"Share Tech Mono", monospace'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none"
        }
      }
    }
  }
});

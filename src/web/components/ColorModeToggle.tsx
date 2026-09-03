import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";

const cycle: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];

const labels = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme"
} as const;

const icons = {
  system: <SettingsBrightnessOutlinedIcon />,
  light: <LightModeOutlinedIcon />,
  dark: <DarkModeOutlinedIcon />
} as const;

export function ColorModeToggle() {
  const { mode, setMode } = useColorScheme();
  const current = mode ?? "system";

  return (
    <Tooltip title={`${labels[current]} — click to cycle`}>
      <IconButton
        color="inherit"
        aria-label={`Color mode: ${labels[current]}`}
        onClick={() => {
          const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
          setMode(next);
        }}
      >
        {icons[current]}
      </IconButton>
    </Tooltip>
  );
}

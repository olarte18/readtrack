import { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

const THEME_KEY = "theme";

const palettes = {
  dark: {
    background: "#13131f",
    surface: "#1e1e2e",
    surfaceAlt: "#2a2a3e",
    text: "#ffffff",
    textMuted: "#aaa",
    textDim: "#666",
    input: "#1e1e2e",
    placeholder: "#666",
    accent: "#cba6f7",
    onAccent: "#13131f",
    danger: "#f38ba8",
    star: "#f5c97b",
    border: "#2a2a3e",
    calendarLow: "#2a2a3e",
    calendarMid: "#6c5ce7",
    calendarHigh: "#cba6f7",
  },
  light: {
    background: "#f2f2f7",
    surface: "#ffffff",
    surfaceAlt: "#e6e6ee",
    text: "#1c1c24",
    textMuted: "#6b6b76",
    textDim: "#9a9aa5",
    input: "#ffffff",
    placeholder: "#9a9aa5",
    accent: "#7c5cbf",
    onAccent: "#ffffff",
    danger: "#d6336c",
    star: "#f0a500",
    border: "#e0e0e6",
    calendarLow: "#dcdce4",
    calendarMid: "#6c5ce7",
    calendarHigh: "#7c5cbf",
  },
};

const navThemes = {
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: palettes.dark.accent,
      background: palettes.dark.background,
      card: palettes.dark.surface,
      text: palettes.dark.text,
      border: palettes.dark.border,
      notification: palettes.dark.danger,
    },
  },
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: palettes.light.accent,
      background: palettes.light.background,
      card: palettes.light.surface,
      text: palettes.light.text,
      border: palettes.light.border,
      notification: palettes.light.danger,
    },
  },
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);
  const [ready, setReady] = useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
      setReady(true);
    });
  }, []);

  const applyTheme = async (mode) => {
    if (mode !== "light" && mode !== "dark" && mode !== "system") return;
    setTheme(mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
  };

  const isPicked = theme !== null;
  const resolved = theme === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme;
  const colors = palettes[resolved ?? "dark"];
  const navigationTheme = navThemes[resolved ?? "dark"];
  const isDark = resolved === "dark";

  return (
    <ThemeContext.Provider
      value={{ theme, isDark, isPicked, ready, colors, navigationTheme, setTheme: applyTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
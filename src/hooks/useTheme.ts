import { useEffect, useCallback } from "react";

export type Theme = "dark" | "light" | "system";

const THEME_KEY = "torchscan-theme";

export function useTheme() {
  const getSystemTheme = useCallback((): "light" | "dark" => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }, []);

  const getStoredTheme = useCallback((): Theme => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  }, []);

  const setStoredTheme = useCallback((theme: Theme) => {
    localStorage.setItem(THEME_KEY, theme);
  }, []);

  const applyTheme = useCallback((theme: Theme) => {
    const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [getSystemTheme]);

  const toggleTheme = useCallback(() => {
    const current = getStoredTheme();
    const next: Theme = current === "dark" ? "light" : current === "light" ? "system" : "dark";
    setStoredTheme(next);
    applyTheme(next);
  }, [getStoredTheme, setStoredTheme, applyTheme]);

  const setTheme = useCallback((theme: Theme) => {
    setStoredTheme(theme);
    applyTheme(theme);
  }, [setStoredTheme, applyTheme]);

  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [getStoredTheme, applyTheme]);

  return {
    theme: getStoredTheme(),
    effectiveTheme: getStoredTheme() === "system" ? getSystemTheme() : getStoredTheme(),
    setTheme,
    toggleTheme,
  };
}

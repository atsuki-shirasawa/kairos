import { useCallback, useEffect, useState } from "react";

/** Color theme choice. `system` follows the OS setting. */
export type Theme = "system" | "light" | "dark";

const KEY = "kairos.theme";

/** Reads the saved choice. Follows the OS when storage is unavailable (private windows etc.). */
function load(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * The theme setting, and toggling .dark on <html> to match.
 * "system" also follows OS changes live. The choice is saved in this browser only.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(load);

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const change = useCallback((next: Theme) => {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Not persisted, but the switch still applies while the page stays open
    }
  }, []);

  return [theme, change];
}

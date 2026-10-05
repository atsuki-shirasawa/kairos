import { useCallback, useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "kairos.theme";

/** 保存した設定を読む。プライベートウィンドウなどで読めなければ OS に従う。 */
function load(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * テーマの設定と、それに合わせた <html> の .dark の付け外し。
 * 「自動」のときは OS の設定の変化にも追従する。設定はこのブラウザにだけ保存する。
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
      // 保存できなくても、開いている間は切り替わっていればよい
    }
  }, []);

  return [theme, change];
}

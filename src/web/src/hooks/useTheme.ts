import { useEffect } from "react";

/** OS の設定に合わせて <html> に .dark を付け外しする。 */
export function useSystemTheme(): void {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
}

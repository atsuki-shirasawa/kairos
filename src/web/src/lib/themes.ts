// The themes the app offers and their names, for the "⋯" menu and the palette.
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";

/** Color theme choice. `system` follows the OS setting. */
export type Theme = "system" | "light" | "dark";

/** The themes offered, in display order. */
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** A theme's name in the UI language. */
export function themeLabel(theme: Theme): string {
  const m = toolbarMessages();
  const labels: Record<Theme, string> = {
    system: m.themeSystem,
    light: m.themeLight,
    dark: m.themeDark,
  };
  return labels[theme];
}

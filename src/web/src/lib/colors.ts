import type { Project } from "@shared/api.ts";
import { paletteMessages } from "@/i18n/messages/format.ts";

/**
 * Project color choices (Japanese mineral pigments). Values are --p0 to --p7 in index.css.
 * `name` is a getter so it follows the current language.
 */
export const PALETTE = (["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"] as const).map((key) => ({
  key,
  get name() {
    return paletteMessages()[key];
  },
}));

/**
 * Project color as a CSS value. The stored color is a key `p0`–`p7` (its value depends on the theme).
 * Without one, colors are assigned in turn by ID.
 */
export function projectColor(project: Pick<Project, "id" | "color"> | null | undefined): string {
  if (!project) return "var(--p5)";
  const key =
    project.color && /^p[0-7]$/.test(project.color)
      ? project.color
      : `p${project.id % PALETTE.length}`;
  return `var(--${key})`;
}

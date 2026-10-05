import type { Project } from "@shared/api.ts";

/** プロジェクトの色の候補（岩絵具）。値は index.css の --p0〜--p7。 */
export const PALETTE = [
  { key: "p0", name: "群青" },
  { key: "p1", name: "緑青" },
  { key: "p2", name: "黄土" },
  { key: "p3", name: "藤" },
  { key: "p4", name: "桜鼠" },
  { key: "p5", name: "鉄" },
  { key: "p6", name: "若竹" },
  { key: "p7", name: "弁柄" },
] as const;

export type PaletteKey = (typeof PALETTE)[number]["key"];

/**
 * プロジェクトの色を CSS の値で返す。保存されている色は `p0`〜`p7` のキー（テーマで値が変わる）。
 * 未設定なら ID から順に割り当てる。
 */
export function projectColor(project: Pick<Project, "id" | "color"> | null | undefined): string {
  if (!project) return "var(--p5)";
  const key =
    project.color && /^p[0-7]$/.test(project.color)
      ? project.color
      : `p${project.id % PALETTE.length}`;
  return `var(--${key})`;
}

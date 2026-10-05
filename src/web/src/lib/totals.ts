// 日・期間の合計。カレンダーの日の見出しとリストの合計の行で同じ数え方をする。
import type { Activity, Usage } from "@shared/api.ts";
import { sumActivity, sumUsage } from "./format.ts";
import type { DayBlock } from "./layout.ts";

/**
 * 日をまたぐブロックは日ごとに分けるが、数は最初の日にだけ載せる（合計で二重に数えないため）。
 * 長さだけは、その日の分を数える。
 */
export const counted = (b: DayBlock) => !b.continuesBefore;
export const usageOf = (b: DayBlock): Usage | null => (counted(b) ? b.segment.usage : null);
export const activityOf = (b: DayBlock): Activity | null =>
  counted(b) ? b.segment.activity : null;

export interface Totals {
  blocks: DayBlock[];
  usage: Usage | null;
  activity: Activity | null;
}

export const totalsOf = (blocks: DayBlock[]): Totals => ({
  blocks,
  usage: sumUsage(blocks.map(usageOf)),
  activity: sumActivity(blocks.map(activityOf)),
});

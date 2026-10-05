// Day and period totals. The calendar day header and the list total rows count the same way.
import type { Activity, Usage } from "@shared/api.ts";
import { sumActivity, sumUsage } from "./format.ts";
import type { DayBlock } from "./layout.ts";

/**
 * Blocks spanning midnight are split per day, but their numbers count only on the first day (so
 * totals don't double count). Only the duration counts per day.
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

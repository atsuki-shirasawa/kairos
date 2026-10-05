// Day and period totals. The calendar day header and the list total rows count the same way.
import type { Activity, Usage } from "@shared/api.ts";
import { sumActivity, sumUsage } from "./format.ts";
import type { DayBlock } from "./layout.ts";

/**
 * Blocks spanning midnight are split per day, but their numbers count only on the first day (so
 * totals don't double count). Only the duration counts per day.
 */
export const counted = (b: DayBlock) => !b.continuesBefore;
/** A block's usage, or null on days after the first. */
export const usageOf = (b: DayBlock): Usage | null => (counted(b) ? b.segment.usage : null);
/** A block's activity, or null on days after the first. */
export const activityOf = (b: DayBlock): Activity | null =>
  counted(b) ? b.segment.activity : null;

/** Totals of a day or period, as the calendar day header and the list total rows show them. */
export interface Totals {
  blocks: DayBlock[];
  usage: Usage | null;
  activity: Activity | null;
}

/** Sums the blocks' usage and activity, counting midnight-spanning blocks once. */
export const totalsOf = (blocks: DayBlock[]): Totals => ({
  blocks,
  usage: sumUsage(blocks.map(usageOf)),
  activity: sumActivity(blocks.map(activityOf)),
});

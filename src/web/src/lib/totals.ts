// Day and period totals. The calendar day header and the list total rows count the same way.
import type { Activity, Usage } from "@shared/api.ts";
import { sumActivity, sumUsage, troubleCount, troubleDetail } from "./format.ts";
import { busyMs, type DayBlock } from "./layout.ts";

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

/** The numbers a day header shows, summed over the day's blocks. */
export interface DayFigures {
  /** Blocks on the day; 0 means nothing to show. */
  shown: number;
  /** Blocks counted on this day (a block spanning midnight counts on its first day only). */
  counted: number;
  busy: number;
  usage: Usage | null;
  activity: Activity | null;
  commits: number;
  prs: number;
  trouble: number;
  /** What kind of snags they were ("" without any), for the places that explain the count. */
  troubleDetail: string;
}

/** Sums the day's blocks into the figures its header (or month cell) shows. */
export function dayFigures(blocks: DayBlock[]): DayFigures {
  const { usage, activity } = totalsOf(blocks);
  return {
    shown: blocks.length,
    counted: blocks.filter(counted).length,
    busy: busyMs(blocks),
    usage,
    activity,
    commits: activity?.commits ?? 0,
    prs: activity?.prs ?? 0,
    trouble: activity ? troubleCount(activity) : 0,
    troubleDetail: activity ? troubleDetail(activity) : "",
  };
}

// The month view's grid: how a day cell fills its lines, and how weeks share the month's height.
import type { DayBlock } from "./dayBlocks.ts";
import { runGroups } from "./marks.ts";

/**
 * How many of a month cell's blocks it lists when `slots` lines fit. When they don't all fit, the
 * last line goes to "+n more" (which opens the day), so `more` counts what it stands for.
 */
export function monthCellFit(total: number, slots: number): { shown: number; more: number } {
  if (total <= slots) return { shown: total, more: 0 };
  const shown = Math.max(0, slots - 1);
  return { shown, more: total - shown };
}

/** A month cell's blocks, split into the marks beside its date and the lines below it. */
export interface CellBlocks<T> {
  /** Groups of marks drawn beside the date, at most `maxMarks` of them. */
  marks: T[][];
  /** Everything else in time order: the blocks too long for a mark, and the marks left over. */
  lines: T[];
}

/**
 * Splits a month cell's blocks (in time order) into marks for its date line and work lines. A day
 * of quick questions can hold dozens of marks; those past `maxMarks` join the lines rather than
 * being clipped out of sight, keeping their place in time.
 */
export function splitCellBlocks<
  T extends Pick<DayBlock, "session" | "segment"> & { mark: boolean },
>(blocks: T[], maxMarks: number): CellBlocks<T> {
  const marks = runGroups(blocks.filter((b) => b.mark)).slice(0, maxMarks);
  const inMarks = new Set(marks.flat());
  return { marks, lines: blocks.filter((b) => !inMarks.has(b)) };
}

/** What `monthRowHeights` needs to share a month's height between its weeks. */
export interface MonthRowSizes {
  /** Height the month has to fill, in px. */
  heightPx: number;
  /** A week with work never gets less than this; below it the month scrolls. */
  minBusyPx: number;
  /** Height of a week without work: enough for its day numbers. */
  emptyPx: number;
}

/**
 * Heights of a month's week rows. Weeks without work shrink to their day numbers and the weeks with
 * work share the rest, so work concentrated in a few weeks isn't truncated to make room for empty
 * ones. With no work at all, the weeks split the height evenly as a plain calendar does.
 */
export function monthRowHeights(busy: boolean[], sizes: MonthRowSizes): number[] {
  const { heightPx, minBusyPx, emptyPx } = sizes;
  const busyCount = busy.filter(Boolean).length;
  if (busyCount === 0) return busy.map(() => Math.max(emptyPx, heightPx / busy.length));
  const busyPx = Math.max(minBusyPx, (heightPx - (busy.length - busyCount) * emptyPx) / busyCount);
  return busy.map((b) => (b ? busyPx : emptyPx));
}

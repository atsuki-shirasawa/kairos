// Work blocks clipped to a day: what the calendar lays out, and what the list and summary count.
import type { CalendarSegment, CalendarSession, Span } from "@shared/api.ts";
import { DAY } from "@shared/dates.ts";

/** A work block clipped to a day, before layout. The list view uses it as is. */
export interface DayBlock {
  session: CalendarSession;
  /** The original section (heading, and start/end before clipping to the day). */
  segment: CalendarSegment;
  /** Midnight of this day (absolute time). */
  dayStart: number;
  /** Start/end in ms since midnight. Blocks spanning midnight are clipped per day. */
  start: number;
  end: number;
  /** Continues from the previous day / into the next day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Whether work from `start` to `end` shows in the period [from, to). Work ending exactly at `from`
 * still counts, so a block that stops at midnight shows on the day it ran. The calendar, the date
 * picker's dots and block navigation all use this one test, so what they show always agrees.
 */
export function overlaps(
  { start, end }: { start: number; end: number },
  from: number,
  to: number,
): boolean {
  return end >= from && start < to;
}

/** Work blocks overlapping the day at `dayStart`, clipped to the day and sorted by start. */
export function blocksOfDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): DayBlock[] {
  const items: DayBlock[] = [];
  for (const session of sessions) {
    for (const segment of session.segments) {
      if (!overlaps(segment, dayStart, dayEnd)) continue;
      const { start: s, end: e } = segment;
      items.push({
        session,
        segment,
        dayStart,
        start: Math.max(s, dayStart) - dayStart,
        end: Math.min(e, dayEnd) - dayStart,
        continuesBefore: s < dayStart,
        continuesAfter: e >= dayEnd,
      });
    }
  }
  // Longer blocks first, so shorter ones stack on top and both headings stay readable
  return items.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * Days (midnight) with at least one work block. Uses the same overlap test as `blocksOfDay`, so
 * opening a day marked with a dot always shows something. Hidden projects don't count.
 */
export function recordedDays(
  spans: Span[],
  days: number[],
  hidden: ReadonlySet<number> = new Set(),
): Set<number> {
  const visible = spans.filter((s) => s.projectId === null || !hidden.has(s.projectId));
  return new Set(days.filter((d) => visible.some((s) => overlaps(s, d, d + DAY))));
}

/** Length of the union of blocks. Overlaps count once, so parallel sessions are not double counted. */
export function busyMs(blocks: Pick<DayBlock, "start" | "end">[]): number {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const { start, end } of sorted) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    } else curEnd = Math.max(curEnd, end);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

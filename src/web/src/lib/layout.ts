// Lays out work blocks in a calendar day column so they don't hide each other.
// Like Google Calendar, blocks whose starts are at least one heading line apart stack in the same
// column with a small offset; only blocks starting almost together (headings would collide) go side
// by side. Splitting into columns more often would make them too narrow in the week view.
import type { CalendarSegment, CalendarSession, Span } from "@shared/api.ts";
import { DAY, MINUTE } from "./dates.ts";

/**
 * Minimum drawn length, so even very short blocks show one line of heading.
 * When stacking, the next block must start at least this much later so the heading below stays visible.
 */
export const MIN_BLOCK_MS = 25 * MINUTE;

export interface PlacedBlock {
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
  /** Column when split side by side, and the number of columns in the cluster. */
  col: number;
  cols: number;
  /** How many columns it spans into free columns on the right (1 = its own only). */
  span: number;
  /** Number of blocks underneath in the same column. Shifted right by that much and drawn on top. */
  depth: number;
  /** When another block starts covering this one (since midnight). The heading must fit above it. */
  coveredFrom: number | null;
}

/** A work block clipped to a day, before layout. The list view uses it as is. */
export type DayBlock = Omit<PlacedBlock, "col" | "cols" | "span" | "depth" | "coveredFrom">;

const visualEnd = (b: { start: number; end: number }) => Math.max(b.end, b.start + MIN_BLOCK_MS);

/** Work blocks overlapping the day at `dayStart`, clipped to the day and sorted by start. */
export function blocksOfDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): DayBlock[] {
  const items: DayBlock[] = [];
  for (const session of sessions) {
    for (const segment of session.segments) {
      const { start: s, end: e } = segment;
      if (e < dayStart || s >= dayEnd) continue;
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
  return new Set(days.filter((d) => visible.some((s) => s.end >= d && s.start < d + DAY)));
}

/** Places the blocks shown on the day at `dayStart`, taking overlaps into account. */
export function layoutDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): PlacedBlock[] {
  const items = blocksOfDay(sessions, dayStart, dayEnd);

  const placed: PlacedBlock[] = [];
  let columns: PlacedBlock[][] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const all = columns.flat();
    for (const b of all) {
      b.cols = columns.length;
      // Widen into columns on the right as long as nothing there visually overlaps
      let span = 1;
      while (
        b.col + span < columns.length &&
        !columns[b.col + span]?.some((o) => o.start < visualEnd(b) && b.start < visualEnd(o))
      )
        span++;
      b.span = span;
    }
    placed.push(...all);
    columns = [];
  };

  for (const item of items) {
    if (item.start >= clusterEnd) closeCluster();
    // A block can stack in a column if it starts at least one heading line after the column's last block.
    // Of those columns, pick the one with the fewest blocks still underneath (a free column gives full width)
    let col = -1;
    let depth = 0;
    columns.forEach((c, i) => {
      if ((c.at(-1)?.start ?? -Infinity) + MIN_BLOCK_MS > item.start) return;
      const d = c.filter((o) => visualEnd(o) > item.start).length;
      if (col === -1 || d < depth) [col, depth] = [i, d];
    });
    if (col === -1) {
      col = columns.length;
      columns.push([]);
    }
    const column = columns[col] ?? [];
    for (const o of column) if (visualEnd(o) > item.start) o.coveredFrom ??= item.start;
    column.push({ ...item, col, cols: 1, span: 1, depth, coveredFrom: null });
    clusterEnd = Math.max(clusterEnd, visualEnd(item));
  }
  closeCluster();
  return placed;
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

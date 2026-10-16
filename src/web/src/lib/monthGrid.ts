// The month view's grid: how a day cell fills its lines, and how weeks share the month's height.
import type { CalendarSession } from "@shared/api.ts";
import { addDays, addMonths, monthWeeks, type Range, startOfMonth } from "./dates.ts";
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

/**
 * The days of the adjacent months that pad the month's first and last weeks, as ranges to fetch
 * beside the month itself. Either is null when the month starts on a Sunday or ends on a Saturday.
 */
export function monthEdges(month: number): { before: Range | null; after: Range | null } {
  const weeks = monthWeeks(month);
  const first = startOfMonth(month);
  const next = addMonths(first, 1);
  const gridStart = weeks[0]?.[0] ?? first;
  const lastWeek = weeks[weeks.length - 1]?.[0] ?? first;
  const gridEnd = addDays(lastWeek, 7);
  return {
    before: gridStart < first ? { from: gridStart, to: first } : null,
    after: next < gridEnd ? { from: next, to: gridEnd } : null,
  };
}

/**
 * Sessions fetched for adjoining ranges, as one list. A session whose work crosses a range's edge
 * comes back from both, and so does a block that crosses midnight; each appears once here, with
 * the blocks of every copy.
 */
export function joinSessions(lists: CalendarSession[][]): CalendarSession[] {
  const byId = new Map<string, CalendarSession>();
  for (const session of lists.flat()) {
    const known = byId.get(session.id);
    byId.set(session.id, known ? withSegmentsOf(known, session) : session);
  }
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * The month's visible sessions with the work on its padding days, or `visible` itself when the
 * edges hold none (so memoized consumers see no change).
 */
export function withEdgeSessions(
  visible: CalendarSession[],
  edges: CalendarSession[][],
): CalendarSession[] {
  return edges.some((e) => e.length > 0) ? joinSessions([visible, ...edges]) : visible;
}

/** `a` with the blocks of `b` it doesn't have yet, in time order. */
function withSegmentsOf(a: CalendarSession, b: CalendarSession): CalendarSession {
  const starts = new Set(a.segments.map((g) => g.start));
  const extra = b.segments.filter((g) => !starts.has(g.start));
  if (extra.length === 0) return a;
  return { ...a, segments: [...a.segments, ...extra].sort((x, y) => x.start - y.start) };
}

// How the week view shares its width among its day columns.
import type { CalendarSession } from "@shared/api.ts";
import { isSameDay } from "./dates.ts";
import { selectedSegment } from "./navigation.ts";

/**
 * Below this lane width a block shows only a word or two of its heading. When a busy day falls
 * below it and a block is selected, that day takes the width (focus) and the others shrink.
 */
export const MIN_LANE_PX = 88;
/** Track of a day without work: just wide enough for the date. */
const EMPTY_TRACK = "minmax(2.5rem, 0.15fr)";
const EMPTY_FR = 0.15;
/** Track of a busy day squeezed by focus on another day. */
const SQUEEZED_TRACK = "minmax(2.5rem, 0.25fr)";

/** Width weight of a busy day: each extra lane of parallel work adds half a day. */
const weightOf = (lanes: number) => 1 + 0.5 * (Math.max(lanes, 1) - 1);

/**
 * Grid column tracks for the days of the week view.
 * `lanes` is how many blocks of each day sit side by side at most (0 for a day without work),
 * `widthPx` the width for the day columns, `focus` the index of the selected day (-1 for none).
 * Days running several sessions in parallel get more width, so their lanes stay readable;
 * days without work stay narrow. If lanes would still be too narrow (e.g. with the drawer open),
 * the selected day and its neighbors keep their width and the rest shrink.
 */
export function columnTracks(lanes: number[], widthPx: number, focus: number): string[] {
  if (lanes.every((n) => n === 0)) return lanes.map(() => "minmax(0, 1fr)");
  const weights = lanes.map((n) => (n === 0 ? EMPTY_FR : weightOf(n)));
  const pxPerFr = widthPx / weights.reduce((a, b) => a + b, 0);
  const narrow = lanes.some((n, i) => n > 0 && ((weights[i] ?? 1) * pxPerFr) / n < MIN_LANE_PX);
  return lanes.map((n, i) => {
    if (n === 0) return EMPTY_TRACK;
    const w = weights[i] ?? 1;
    if (narrow && focus !== -1 && i !== focus)
      return Math.abs(i - focus) === 1 ? `minmax(0, ${w * 0.6}fr)` : SQUEEZED_TRACK;
    return `minmax(0, ${w}fr)`;
  });
}

/**
 * Index of the day holding the selected block, which keeps its width when columns get narrow.
 * -1 when nothing is selected or the view has few enough days that every column is wide.
 */
export function focusDayIndex(
  sessions: CalendarSession[],
  selectedId: string | null,
  selectedAt: number | null,
  days: number[],
): number {
  const seg = selectedSegment(sessions, selectedId, selectedAt);
  if (!seg || days.length <= 3) return -1;
  // A block continued from before the period belongs to its first shown day
  const t = Math.max(seg.start, days[0] ?? 0);
  return days.findIndex((d) => isSameDay(d, t));
}

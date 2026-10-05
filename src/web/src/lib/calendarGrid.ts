// Geometry of the calendar time grid: where blocks are drawn, and which ones are scrolled out of view.
import type { CalendarSession } from "@shared/api.ts";
import { HOUR, isSameDay } from "./dates.ts";
import { MIN_BLOCK_MS, type PlacedBlock } from "./layout.ts";
import { selectedSegment } from "./navigation.ts";

/** Hint for blocks scrolled out of view (above or below). */
export interface Edge {
  count: number;
  /** Time of the nearest block (for display), and the scroll position that brings it into view. */
  time: number;
  scrollTo: number;
}

/** The hints on both edges of the scroll area. */
export interface Edges {
  above: Edge | null;
  below: Edge | null;
}

/** No blocks out of view. */
export const NO_EDGES: Edges = { above: null, below: null };

/** What the edge detection needs of a block: its time since midnight, and its day. */
type TimedBlock = Pick<PlacedBlock, "dayStart" | "start" | "end">;

/** The visible part of the scroll area, in px. */
export interface Viewport {
  scrollTop: number;
  heightPx: number;
  hourPx: number;
}

/** Slack so a block touching the edge by a few px doesn't count as off screen. */
const EDGE_SLACK_PX = 4;
/** Room left above a block brought into view from above, so it doesn't sit flush with the edge. */
const ABOVE_MARGIN_PX = 24;

/** Y position of a time since midnight. */
const yOf = (ms: number, hourPx: number) => (ms / HOUR) * hourPx;

/** Drawn height of a block before the gap between blocks. Short blocks are drawn at the minimum. */
export const drawnPx = (b: Pick<PlacedBlock, "start" | "end">, hourPx: number): number =>
  yOf(Math.max(b.end - b.start, MIN_BLOCK_MS), hourPx);

/**
 * Blocks entirely above or below the viewport, with the nearest one on each side. Blocks of every
 * shown day are compared by time since midnight, since all days share the same vertical axis.
 */
export function findEdges(blocks: TimedBlock[], view: Viewport): Edges {
  const { scrollTop, heightPx, hourPx } = view;
  const top = (b: TimedBlock) => yOf(b.start, hourPx);
  const bottom = (b: TimedBlock) => top(b) + drawnPx(b, hourPx);
  const above = blocks
    .filter((b) => bottom(b) <= scrollTop + EDGE_SLACK_PX)
    .sort((a, b) => b.end - a.end);
  const below = blocks
    .filter((b) => top(b) >= scrollTop + heightPx - EDGE_SLACK_PX)
    .sort((a, b) => a.start - b.start);
  const a = above[0];
  const b = below[0];
  return {
    above: a
      ? { count: above.length, time: a.dayStart + a.end, scrollTo: top(a) - ABOVE_MARGIN_PX }
      : null,
    // Bring a block from below up to a quarter of the way down, so what follows it shows too
    below: b
      ? { count: below.length, time: b.dayStart + b.start, scrollTo: top(b) - heightPx / 4 }
      : null,
  };
}

/** Whether two hints read the same (the scroll target alone moving isn't worth a re-render). */
const sameEdge = (a: Edge | null, b: Edge | null) =>
  a === b || (a !== null && b !== null && a.count === b.count && a.time === b.time);

/** Whether both edges' hints read the same. */
export const sameEdges = (a: Edges, b: Edges): boolean =>
  sameEdge(a.above, b.above) && sameEdge(a.below, b.below);

/** Where and how a block is drawn in its day column, in px. */
export interface BlockGeometry {
  top: number;
  /** Drawn height, at least the minimum block length so a heading fits. */
  height: number;
  /** Height of the block's real length, which alone gets the fill. */
  filledPx: number;
  /** Drawn taller than its real length (a short block given room for its heading). */
  stretched: boolean;
  /** Too low for the usual padding; one line of heading only. */
  short: boolean;
  /** Height not covered by a block stacked on top, where the heading must fit. */
  visible: number;
  /** Heading lines that fit in the visible part (1 to 3). */
  lines: number;
}

/** Below this height, a block tightens its padding so one line fits even at MIN_BLOCK_MS. */
const SHORT_PX = 34;
/** Height of one heading line, and the block's vertical padding, for counting lines that fit. */
const LINE_PX = 16.5;
const PADDING_PX = 8;

/** Computes a block's position and the room its heading has. */
export function blockGeometry(block: PlacedBlock, hourPx: number): BlockGeometry {
  const { start, end, coveredFrom } = block;
  // 1px gap above and 2px below, so adjacent blocks don't merge
  const height = drawnPx(block, hourPx) - 2;
  // Blocks shorter than the minimum still get room for a heading, but only their real length is
  // filled, so a 2-minute block doesn't read as half an hour. The rest is a plain label area
  const filledPx = Math.max(3, yOf(end - start, hourPx) - 2);
  const visible = coveredFrom === null ? height : yOf(coveredFrom - start, hourPx);
  return {
    top: yOf(start, hourPx) + 1,
    height,
    filledPx,
    stretched: filledPx < height,
    short: height < SHORT_PX,
    visible,
    lines: Math.max(1, Math.min(3, Math.floor((visible - PADDING_PX) / LINE_PX))),
  };
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

/** Whether this is the session's last work block (only it gets the "in progress" mark). */
export function isLastSegment(block: PlacedBlock): boolean {
  const last = Math.max(...block.session.segments.map((g) => g.end));
  return block.segment.end >= last && block.dayStart + block.end >= block.segment.end;
}

// Geometry of the calendar time grid: where blocks are drawn, and which ones are scrolled out of view.
import type { Artifact, CalendarSession } from "@shared/api.ts";
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
    lines: headingLines(visible),
  };
}

/** Heading lines (1 to 3) that fit in `px` of a block, after its vertical padding. */
export function headingLines(px: number): number {
  return Math.max(1, Math.min(3, Math.floor((px - PADDING_PX) / LINE_PX)));
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

/** Radius of a commit or PR node drawn on a block, in px. */
const NODE_R = 4;

/** A commit or PR placed on a block at the moment it was made. */
export interface Moment {
  artifact: Artifact;
  /** Offset from the block's top, in px. */
  y: number;
}

/**
 * The block's commits and PRs at the height of the moment they were made, top to bottom. These
 * are the moments a block of work turned into something, so the calendar marks where they
 * happened rather than only counting them. Ones recorded just after the block (within the grace
 * the server allows) sit on its bottom edge; on a block split at midnight, each day gets its own.
 */
export function blockMoments(block: PlacedBlock, hourPx: number, filledPx: number): Moment[] {
  const { segment, dayStart, start, end, continuesAfter } = block;
  const moments: Moment[] = [];
  for (const artifact of [...segment.prs, ...segment.commits]) {
    if (artifact.ts === null) continue;
    const t = artifact.ts - dayStart;
    if (t < start || (continuesAfter && t > end)) continue;
    // Kept a node's radius inside the block, which clips anything past its edges
    const y = Math.min(
      Math.max(yOf(t - start, hourPx), NODE_R),
      Math.max(NODE_R, filledPx - NODE_R),
    );
    moments.push({ artifact, y });
  }
  // PRs first at the same height: they are the bigger milestone and draw on top
  return moments.sort((a, b) => a.y - b.y || (a.artifact.kind === "pr" ? -1 : 1));
}

/** Moments closer than this (px) would crowd as nodes (a 7px node plus a 3px gap), so they are drawn as one mark. */
const MERGE_GAP_PX = 10;
/** Diameter of a node, and how much longer a mark grows per extra moment it holds. */
const NODE_PX = 7;
const BEAD_PX = 3;

/** One mark on a block's edge: a single node, or a pill for moments made in quick succession. */
export interface MomentMark {
  /** Top of the mark, from the block's top, in px. */
  top: number;
  height: number;
  /** Moments it stands for. */
  count: number;
  /** Holds a PR, so it is drawn filled. */
  pr: boolean;
}

/**
 * Groups moments (sorted by `y`) into the marks drawn on a block's edge. Nodes for commits a
 * minute apart would sit on top of each other and read as one, so a run of moments each within
 * `MERGE_GAP_PX` of the next becomes one pill spanning them. It grows by `BEAD_PX` per extra
 * moment, so a burst of several reads as more than a pair even when they are minutes apart.
 */
export function momentMarks(moments: Moment[], filledPx: number): MomentMark[] {
  const runs: Moment[][] = [];
  for (const m of moments) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (run && last && m.y - last.y < MERGE_GAP_PX) run.push(m);
    else runs.push([m]);
  }
  return runs.map((run) => {
    const first = run[0]?.y ?? 0;
    const last = run.at(-1)?.y ?? first;
    const height = Math.max(last - first, (run.length - 1) * BEAD_PX) + NODE_PX;
    // Centered on the run, then kept inside the block, which clips at its edges
    const top = Math.min(
      Math.max((first + last) / 2 - height / 2, 0),
      Math.max(0, filledPx - height),
    );
    return { top, height, count: run.length, pr: run.some((m) => m.artifact.kind === "pr") };
  });
}

/** Where one label of a block's moments goes, or the "+n" row standing in for those that don't fit. */
export type MomentRow =
  | { kind: "moment"; moment: Moment; top: number }
  | { kind: "more"; count: number; top: number };

/**
 * Lays out labels for moments (sorted by `y`) in a lane `heightPx` tall. Each label sits centered
 * on its moment, pushed apart just enough not to overlap, and pulled up from the bottom edge when
 * several crowd there. When there are more than fit, the last row becomes "+n" for the rest, so a
 * busy hour never spills out of its block.
 */
export function momentRows(moments: Moment[], rowPx: number, heightPx: number): MomentRow[] {
  const fit = Math.floor(heightPx / rowPx);
  if (fit <= 0 || moments.length === 0) return [];
  const overflow = moments.length > fit;
  const shown = overflow ? moments.slice(0, fit - 1) : moments;
  const rows: MomentRow[] = shown.map((moment) => ({ kind: "moment", moment, top: moment.y }));
  if (overflow) {
    const y = moments[fit - 1]?.y ?? heightPx;
    rows.push({ kind: "more", count: moments.length - shown.length, top: y });
  }
  // Downward: center on the moment, below the previous label. Upward: keep inside the bottom
  // edge. At most `fit` rows, so the upward pass never pushes the first one above the top
  let next = 0;
  for (const row of rows) {
    row.top = Math.max(row.top - rowPx / 2, next);
    next = row.top + rowPx;
  }
  let limit = heightPx;
  for (const row of rows.toReversed()) {
    row.top = Math.min(row.top, limit - rowPx);
    limit = row.top;
  }
  return rows;
}

/** Least distance between two marks of short work, so each stays visible and clickable. */
const MARK_GAP_PX = 6;

/**
 * Y positions of the marks of short work in a column, given their times as y (sorted). Quick
 * questions often come minutes apart; each is pushed just below the one above so none hides
 * another, at the cost of a few pixels of time.
 */
export function markTops(ys: number[]): number[] {
  const tops: number[] = [];
  for (const y of ys) {
    const prev = tops.at(-1);
    tops.push(prev === undefined ? y : Math.max(y, prev + MARK_GAP_PX));
  }
  return tops;
}

/**
 * How many of a month cell's blocks it lists when `slots` lines fit. When they don't all fit, the
 * last line goes to "+n more" (which opens the day), so `more` counts what it stands for.
 */
export function monthCellFit(total: number, slots: number): { shown: number; more: number } {
  if (total <= slots) return { shown: total, more: 0 };
  const shown = Math.max(0, slots - 1);
  return { shown, more: total - shown };
}

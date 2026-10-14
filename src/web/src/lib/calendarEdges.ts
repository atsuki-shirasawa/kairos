// Which blocks of the calendar time grid are scrolled out of view, for the hints on its edges.
import { drawnPx, yOf } from "./blockGeometry.ts";
import type { PlacedBlock } from "./layout.ts";

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

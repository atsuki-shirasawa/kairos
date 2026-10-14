// A block's commits and PRs placed at the moment they were made: nodes on its edge, and labels in
// the day view's lane beside it.
import type { Artifact } from "@shared/api.ts";
import { yOf } from "./blockGeometry.ts";
import type { PlacedBlock } from "./layout.ts";

/** Radius of a commit or PR node drawn on a block, in px. */
const NODE_R = 4;

/** A commit or PR placed on a block at the moment it was made. */
export interface Moment {
  artifact: Artifact;
  /** Offset from the block's top, in px. */
  y: number;
}

/**
 * `value` kept between `lo` and `hi`, and at `lo` when the room is smaller than that (`hi` below
 * `lo`). A block clips anything past its edges, so a mark is held inside it rather than centered
 * past an edge; on a block too short to hold it, the mark keeps to the top.
 */
export function clampInside(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), Math.max(lo, hi));
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
    // Kept a node's radius inside the block
    const y = clampInside(yOf(t - start, hourPx), NODE_R, filledPx - NODE_R);
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
    // Centered on the run, then kept inside the block
    const top = clampInside((first + last) / 2 - height / 2, 0, filledPx - height);
    return { top, height, count: run.length, pr: run.some((m) => m.artifact.kind === "pr") };
  });
}

/** Where one label of a block's moments goes, or the "+n" row standing in for those that don't fit. */
export type MomentRow =
  | { kind: "moment"; moment: Moment; top: number }
  | { kind: "more"; count: number; top: number };

/**
 * The rows for `fit` slots, each at its moment's height: every moment when they fit, otherwise
 * the first `fit - 1` and a "+n" row for the rest, at the height of the first one left out.
 */
function rowsThatFit(moments: Moment[], fit: number, heightPx: number): MomentRow[] {
  const overflow = moments.length > fit;
  const shown = overflow ? moments.slice(0, fit - 1) : moments;
  const rows: MomentRow[] = shown.map((moment) => ({ kind: "moment", moment, top: moment.y }));
  if (!overflow) return rows;
  const y = moments[fit - 1]?.y ?? heightPx;
  return [...rows, { kind: "more", count: moments.length - shown.length, top: y }];
}

/** Rows centered on their height, each moved down just below the one before so none overlap. */
export function pushDown(rows: MomentRow[], rowPx: number): MomentRow[] {
  let next = 0;
  return rows.map((row) => {
    const top = Math.max(row.top - rowPx / 2, next);
    next = top + rowPx;
    return { ...row, top };
  });
}

/**
 * Rows moved up from the bottom, each kept above the one after it, so a crowd at the bottom edge
 * stays inside a lane `heightPx` tall. With at most as many rows as fit, the first never goes
 * above the top.
 */
export function pullUp(rows: MomentRow[], rowPx: number, heightPx: number): MomentRow[] {
  let limit = heightPx;
  return rows
    .toReversed()
    .map((row) => {
      const top = Math.min(row.top, limit - rowPx);
      limit = top;
      return { ...row, top };
    })
    .toReversed();
}

/**
 * Lays out labels for moments (sorted by `y`) in a lane `heightPx` tall. Each label sits centered
 * on its moment, pushed apart just enough not to overlap, and pulled up from the bottom edge when
 * several crowd there. When there are more than fit, the last row becomes "+n" for the rest, so a
 * busy hour never spills out of its block.
 */
export function momentRows(moments: Moment[], rowPx: number, heightPx: number): MomentRow[] {
  const fit = Math.floor(heightPx / rowPx);
  if (fit <= 0 || moments.length === 0) return [];
  return pullUp(pushDown(rowsThatFit(moments, fit, heightPx), rowPx), rowPx, heightPx);
}

// Geometry of the calendar time grid: where a block is drawn in its day column, and in what order.
import { HOUR } from "@shared/dates.ts";
import { MIN_BLOCK_MS, type PlacedBlock } from "./layout.ts";
import { sessionEnd } from "./selection.ts";

/** Y position of a time since midnight, at `hourPx` per hour. */
export const yOf = (ms: number, hourPx: number): number => (ms / HOUR) * hourPx;

/** Drawn height of a block before the gap between blocks. Short blocks are drawn at the minimum. */
export const drawnPx = (b: Pick<PlacedBlock, "start" | "end">, hourPx: number): number =>
  yOf(Math.max(b.end - b.start, MIN_BLOCK_MS), hourPx);

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
 * Lift for blocks in full view during a search, so a faded block never sits on top of one. Far
 * above `1 + depth * 2 + 1` for any real stack; the column's block layer is isolated, so neither
 * this nor `RAISED_LAYER` reaches past it.
 */
const SHOWN_LAYER = 1000;

/** Offset that brings a faded block back on top while it is hovered or focused. */
export const RAISED_LAYER = 2 * SHOWN_LAYER;

/**
 * Paint order (z-index) of a block in its day column. Later blocks draw on top, and a selected
 * block rises one step but never above the ones stacked over it. During a search, blocks in full
 * view sit in a layer above the faded (`muted`) ones, keeping that order within each layer.
 */
export function stackOrder({
  depth,
  selected,
  muted,
}: {
  depth: number;
  selected: boolean;
  muted: boolean;
}): number {
  return (muted ? 0 : SHOWN_LAYER) + 1 + depth * 2 + (selected ? 1 : 0);
}

/** Whether this is the session's last work block (only it gets the "in progress" mark). */
export function isLastSegment(block: PlacedBlock): boolean {
  return (
    block.segment.end >= sessionEnd(block.session) &&
    block.dayStart + block.end >= block.segment.end
  );
}

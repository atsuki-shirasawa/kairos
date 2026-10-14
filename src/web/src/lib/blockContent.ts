// What a calendar card has room to show besides its heading: the time range, the summary's goal
// and the day view's lane of commits and PRs, and how many heading lines are left beside them.
import { parseSummaryBody } from "@shared/summaryBody.ts";
import { type BlockGeometry, headingLines } from "./blockGeometry.ts";
import type { PlacedBlock } from "./layout.ts";

/** Blocks at least this tall (and this uncovered) have room for the time range line. */
export const META_MIN_PX = 52;
/** Height the time range line takes under the heading (its line plus the gap above it). */
export const META_ROW_PX = 18;
/** In the day view, blocks with this much visible height also show the summary body. */
export const BODY_MIN_PX = 96;
/** Height of one label in the day view's lane of commits and PRs. */
export const LANE_ROW_PX = 18;

/** What a card shows apart from its heading text, decided from the room it has. */
export interface BlockContent {
  /** Show the time range line under the heading. */
  meta: boolean;
  /** Heading lines that fit beside everything else. */
  lines: number;
  /** The summary text shown under the heading, if the card has room for it. */
  body: string | null;
  /** Show the day view's lane of commits and PRs. */
  lane: boolean;
}

/** How a card is shown, which decides what it has room for. */
export interface BlockContentOptions {
  /** The day view, wide enough for the body and the lane. */
  detailed: boolean;
  selected: boolean;
  /** How many commits and PRs the block shows (`blockMoments`). */
  momentCount: number;
}

/**
 * What a block shows under its heading: the summary's Goal, which says why the work was done next
 * to a heading that says what it was. The lane beside it already shows what came of it, and the
 * drawer has the rest. A body in another format is shown whole.
 */
export function blockBody(body: string | null): string | null {
  return body && (parseSummaryBody(body)?.goal ?? body);
}

/** What a card in a day column shows besides its heading, given its geometry. */
export function blockContent(
  block: Pick<PlacedBlock, "segment">,
  geo: BlockGeometry,
  { detailed, selected, momentCount }: BlockContentOptions,
): BlockContent {
  // In the day view a tall block has room to be read without opening the drawer
  const body = detailed && geo.visible >= BODY_MIN_PX ? blockBody(block.segment.body) : null;
  // In the week view the block's position on the grid already tells the time, so the range line
  // only repeats it; it stays for the selected block, and the tooltip always has it
  const meta = (detailed || selected) && geo.height >= META_MIN_PX && geo.visible >= META_MIN_PX;
  // Two rows at least: a lane with room for only "+n more" says nothing the tooltip doesn't
  const lane = detailed && momentCount > 0 && geo.visible >= 2 * LANE_ROW_PX;
  return { meta, lines: headingLinesBeside(geo, { body: Boolean(body), meta }), body, lane };
}

/**
 * Heading lines left beside the body or the time range: the two would overlap otherwise. A short
 * block always has one, and a block showing its body two.
 */
function headingLinesBeside(geo: BlockGeometry, shown: { body: boolean; meta: boolean }): number {
  if (geo.short) return 1;
  if (shown.body) return 2;
  if (shown.meta) return headingLines(geo.visible - META_ROW_PX);
  return geo.lines;
}

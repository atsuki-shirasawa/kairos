// What a calendar card has room to show besides its heading (the time range), and how many
// heading lines are left beside it.
import { type BlockGeometry, headingLines } from "./blockGeometry.ts";

/** Blocks at least this tall (and this uncovered) have room for the time range line. */
export const META_MIN_PX = 52;
/** Height the time range line takes under the heading (its line plus the gap above it). */
export const META_ROW_PX = 18;

/** What a card shows apart from its heading text, decided from the room it has. */
export interface BlockContent {
  /** Show the time range line under the heading. */
  meta: boolean;
  /** Heading lines that fit beside everything else. */
  lines: number;
}

/** What a card in a day column shows besides its heading, given its geometry. */
export function blockContent(
  geo: BlockGeometry,
  { selected }: { selected: boolean },
): BlockContent {
  // The block's position on the grid already tells the time, so the range line only repeats it;
  // it stays for the selected block, and the tooltip always has it
  const meta = selected && geo.height >= META_MIN_PX && geo.visible >= META_MIN_PX;
  return { meta, lines: headingLinesBeside(geo, meta) };
}

/** Heading lines left beside the time range: the two would overlap otherwise. A short block always has one. */
function headingLinesBeside(geo: BlockGeometry, meta: boolean): number {
  if (geo.short) return 1;
  if (meta) return headingLines(geo.visible - META_ROW_PX);
  return geo.lines;
}

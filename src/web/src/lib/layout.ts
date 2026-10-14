// Lays out work blocks in a calendar day column so they don't hide each other.
// Like Google Calendar, blocks whose starts are at least one heading line apart stack in the same
// column with a small offset; only blocks starting almost together (headings would collide) go side
// by side. Splitting into columns more often would make them too narrow in the week view.
import type { CalendarSession } from "@shared/api.ts";
import { DAY, MINUTE } from "@shared/dates.ts";
import { blocksOfDay, type DayBlock } from "./dayBlocks.ts";
import { isMark } from "./marks.ts";

/**
 * Minimum drawn length, so even very short blocks show one line of heading.
 * When stacking, the next block must start at least this much later so the heading below stays visible.
 */
export const MIN_BLOCK_MS = 25 * MINUTE;

/** A work block positioned in a day column of the calendar. */
export interface PlacedBlock extends DayBlock {
  /** Column when split side by side, and the number of columns in the cluster. */
  col: number;
  cols: number;
  /** How many columns it spans into free columns on the right (1 = its own only). */
  span: number;
  /** Number of blocks underneath in the same column. Shifted right by that much and drawn on top. */
  depth: number;
  /** When another block starts covering this one (since midnight). The heading must fit above it. */
  coveredFrom: number | null;
  /** Short work, drawn as a mark on the column's edge and left out of the column layout. */
  mark: boolean;
}

const visualEnd = (b: { start: number; end: number }) => Math.max(b.end, b.start + MIN_BLOCK_MS);

/** Whether two blocks overlap as drawn, each at least `MIN_BLOCK_MS` tall. */
const drawnOverlap = (a: DayBlock, b: DayBlock) => a.start < visualEnd(b) && b.start < visualEnd(a);

/**
 * How many columns `block` spans: its own, then each column to its right as long as nothing there
 * overlaps it as drawn, so a block beside a short neighbor widens into the room below it.
 */
export function spanInto(block: PlacedBlock, columns: PlacedBlock[][]): number {
  let span = 1;
  while (
    block.col + span < columns.length &&
    !columns[block.col + span]?.some((o) => drawnOverlap(o, block))
  )
    span++;
  return span;
}

/**
 * The column a block starting at `start` goes in, and how many blocks are still underneath it
 * there. A block can stack in a column if it starts at least one heading line after the column's
 * last block; of those columns, the one with the fewest blocks still underneath wins (a free
 * column gives full width). `col` is -1 when no column has room.
 */
export function pickColumn(
  columns: PlacedBlock[][],
  start: number,
): { col: number; depth: number } {
  let col = -1;
  let depth = 0;
  columns.forEach((c, i) => {
    if ((c.at(-1)?.start ?? -Infinity) + MIN_BLOCK_MS > start) return;
    const d = c.filter((o) => visualEnd(o) > start).length;
    if (col === -1 || d < depth) [col, depth] = [i, d];
  });
  return { col, depth };
}

/**
 * The blocks of a closed cluster (columns of blocks overlapping as drawn), each told how many
 * columns the cluster has and how far it widens to the right.
 */
export function finishCluster(columns: PlacedBlock[][]): PlacedBlock[] {
  const all = columns.flat();
  for (const b of all) {
    b.cols = columns.length;
    b.span = spanInto(b, columns);
  }
  return all;
}

/** A short block as placed: a mark on the column's edge, taking no column. */
const asMark = (item: DayBlock): PlacedBlock => ({
  ...item,
  col: 0,
  cols: 1,
  span: 1,
  depth: 0,
  coveredFrom: null,
  mark: true,
});

/** Records on the blocks still drawn under `start` that a block placed there covers them from then. */
function coverFrom(column: PlacedBlock[], start: number): void {
  for (const o of column) if (visualEnd(o) > start) o.coveredFrom ??= start;
}

/**
 * Places the blocks shown on the day at `dayStart`, taking overlaps into account. Marks (short
 * work) come back too, so day totals and navigation still count them, but take no column.
 */
export function layoutDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): PlacedBlock[] {
  const placed: PlacedBlock[] = [];
  let columns: PlacedBlock[][] = [];
  let clusterEnd = -1;
  for (const item of blocksOfDay(sessions, dayStart, dayEnd)) {
    if (isMark(item)) {
      placed.push(asMark(item));
      continue;
    }
    if (item.start >= clusterEnd) {
      placed.push(...finishCluster(columns));
      columns = [];
    }
    let { col, depth } = pickColumn(columns, item.start);
    if (col === -1) {
      col = columns.length;
      columns.push([]);
    }
    const column = columns[col] ?? [];
    coverFrom(column, item.start);
    column.push({ ...item, col, cols: 1, span: 1, depth, coveredFrom: null, mark: false });
    clusterEnd = Math.max(clusterEnd, visualEnd(item));
  }
  placed.push(...finishCluster(columns));
  return placed;
}

// Whose turn it was within work blocks: the stored turn spans (see ingest/turnSpans.ts) cut to
// each block, in one query over a whole set of blocks.
import type { Database } from "bun:sqlite";
import type { TurnSpan } from "../../shared/api.ts";
import {
  BLOCK_COLUMNS,
  type BlockLookup,
  type BlockRef,
  type BlockSet,
  groupByBlock,
  lookupByBlock,
  withBlocks,
} from "./sql.ts";

/** Each block's turn spans in time order, cut to the block; none for a block without them. */
export function blocksTurns(db: Database, set: BlockSet): BlockLookup<TurnSpan[]> {
  const rows = db
    .query<TurnSpan & BlockRef, (string | number)[]>(
      `${withBlocks(set)}
       SELECT ${BLOCK_COLUMNS}, MAX(t.start, b.start) AS start, MIN(t.end, b.end) AS end, t.who
       FROM b JOIN turn_spans t ON t.session_id = b.session_id
        AND t.start < b.end AND t.end > b.start
       ORDER BY t.session_id, t.start`,
    )
    .all(...set.params);
  const spans = new Map(
    [...groupByBlock(rows)].map(([key, list]) => [
      key,
      list.map(({ start, end, who }) => ({ start, end, who })),
    ]),
  );
  return lookupByBlock(spans, []);
}

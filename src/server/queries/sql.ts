// SQL conditions several query modules share, so they can't drift apart.
import type { Artifact } from "../../shared/api.ts";

/**
 * The work blocks a batched block query runs over: SQL yielding one `session_id, start, end` row
 * per block, and the parameters it binds. The calendar passes a period's blocks and the drawer a
 * session's, so each fact about a block is counted by one query for all of them.
 */
export interface BlockSet {
  sql: string;
  params: (string | number)[];
}

/** Opens a batched block query: the set's blocks as the CTE `b`, which `ownRowsInBlock` joins on. */
export function withBlocks(set: BlockSet): string {
  return `WITH b(session_id, start, end) AS (${set.sql})`;
}

/**
 * Join condition keeping the rows of table `alias` that a block `b` owns: its session's rows
 * within the block (allowing `graceMs` after its end), leaving out copies from the session it
 * continued.
 */
export function ownRowsInBlock(alias: string, graceMs = 0): string {
  const end = graceMs > 0 ? `b.end + ${graceMs}` : "b.end";
  return `${alias}.session_id = b.session_id AND ${alias}.is_copy = 0 AND ${alias}.ts BETWEEN b.start AND ${end}`;
}

/** Columns naming the block a batched query's row belongs to, read back by `blockKey`. */
export const BLOCK_COLUMNS = "b.session_id AS sessionId, b.start AS blockStart";

/** A row of a batched block query, named by `BLOCK_COLUMNS`. */
export interface BlockRef {
  sessionId: string;
  blockStart: number;
}

/** Key of a block in the maps batched block queries return. */
export function blockKey(sessionId: string, start: number): string {
  return `${sessionId} ${start}`;
}

/** What a batched block query found for one block, read by its session and start. */
export type BlockLookup<T> = (sessionId: string, start: number) => T;

/** Reads `values` by block, giving `none` for a block the query found nothing for. */
export function lookupByBlock<T>(values: Map<string, T>, none: T): BlockLookup<T> {
  return (sessionId, start) => values.get(blockKey(sessionId, start)) ?? none;
}

/** The one row per block of a grouped batched query, by `blockKey`, without its `BlockRef`. */
export function byBlock<T>(rows: (T & BlockRef)[]): Map<string, T> {
  return new Map(
    rows.map(({ sessionId, blockStart, ...rest }) => [blockKey(sessionId, blockStart), rest as T]),
  );
}

/** The several rows per block of a batched query (one per model, say), by `blockKey`. */
export function groupByBlock<T extends BlockRef>(rows: T[]): Map<string, T[]> {
  return Map.groupBy(rows, (r) => blockKey(r.sessionId, r.blockStart));
}

/** One column of a grouped batched query's rows, by `blockKey`. */
export function valueByBlock<K extends string, V>(
  rows: (BlockRef & Record<K, V>)[],
  column: K,
): Map<string, V> {
  return new Map(rows.map((r) => [blockKey(r.sessionId, r.blockStart), r[column]]));
}

/** Artifact kinds a session or block lists (merges are only counted). */
const LISTED_ARTIFACT_KINDS: readonly Artifact["kind"][] = ["pr", "commit"];

/**
 * Condition on the artifacts table (aliased `alias`, if given) keeping the commits and PRs a
 * session made itself, not copies from the session it continued.
 */
export function listedArtifactsSql(alias?: string): string {
  const column = (c: string) => (alias ? `${alias}.${c}` : c);
  const kinds = LISTED_ARTIFACT_KINDS.map((k) => `'${k}'`).join(", ");
  return `${column("kind")} IN (${kinds}) AND ${column("is_copy")} = 0`;
}

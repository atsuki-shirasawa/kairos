import type { Database } from "bun:sqlite";
import { blockIdOf } from "../../src/server/summarize/blocks.ts";
import { saveSummary } from "../../src/server/summarize/store.ts";

/** A stored summary's fields, for tests that put one in place without running the summarizer. */
export interface SummaryFields {
  headline?: string;
  body?: string;
  model?: string;
  /** How far the summary reaches; past the block's end means it is up to date. */
  coveredUntil?: number;
  createdAt?: number;
}

/**
 * Stores (or replaces) a summary for the block of `sessionId` starting at `start`, as written when
 * the block started there. Throws when no such block exists, so a test can't save into nothing.
 */
export function putSummary(
  db: Database,
  sessionId: string,
  start: number,
  {
    headline = "x",
    body = "y",
    model = "m",
    coveredUntil = 1e15,
    createdAt = 0,
  }: SummaryFields = {},
): void {
  const blockId = blockIdOf(db, { sessionId, start });
  if (blockId === null) throw new Error(`no block of ${sessionId} starts at ${start}`);
  saveSummary(
    db,
    blockId,
    { headline, body },
    { model, covered: { from: start, until: coveredUntil }, createdAt },
  );
}

/** The summary of the block of `sessionId` starting at `start`, or null. */
export function summaryAt(
  db: Database,
  sessionId: string,
  start: number,
): { headline: string; body: string; covered_until: number } | null {
  return db
    .query<{ headline: string; body: string; covered_until: number }, [string, number]>(
      `SELECT sm.headline, sm.body, sm.covered_until FROM summaries sm
       JOIN segments g ON g.id = sm.block_id WHERE g.session_id = ? AND g.start = ?`,
    )
    .get(sessionId, start);
}

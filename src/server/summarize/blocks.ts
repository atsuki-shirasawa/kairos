// Stored work blocks as the summarizer sees them: which block a section or a moment is (the
// summarizer names a section by its session and start, as the API and URLs do, while summaries and
// open items reference the block's id, which recomputation keeps when the block's start moves), and
// whether a block's summary still covers it.
import type { Database } from "bun:sqlite";
import type { SectionRef } from "./target.ts";

/** A section with the id of its stored block, as the ledger records it. */
export interface PlacedSection extends SectionRef {
  blockId: number;
}

/** The section's block (its id and end), or null when no block starts there (any more). */
export function sectionBlock(
  db: Database,
  section: SectionRef,
): { id: number; end: number } | null {
  return db
    .query<{ id: number; end: number }, [string, number]>(
      "SELECT id, end FROM segments WHERE session_id = ? AND start = ?",
    )
    .get(section.sessionId, section.start);
}

/** The id of the section's block, or null when no block starts there (any more). */
export function blockIdOf(db: Database, section: SectionRef): number | null {
  return sectionBlock(db, section)?.id ?? null;
}

/**
 * Whether block `blockId` still starts at `start`: a summary read from it can be saved there.
 * Recomputation may have moved the block, or split it and given that start to a new block.
 */
export function stillStartsAt(db: Database, blockId: number, start: number): boolean {
  return (
    db
      .query<{ x: number }, [number, number]>(
        "SELECT 1 AS x FROM segments WHERE id = ? AND start = ?",
      )
      .get(blockId, start) !== null
  );
}

/**
 * Whether the summary `sm` of block `g` no longer covers it: the block ends elsewhere than what was
 * read (it ran on, or a topic split cut it short and the summary tells of work now in the next
 * block), or now starts elsewhere (recomputation moved it, or folded another block into it). SQL
 * over a `segments g` row joined with its `summaries sm` row.
 */
export const STALE_SUMMARY_SQL = "(sm.covered_until != g.end OR sm.covered_from != g.start)";

/**
 * The block a time falls in: the last one starting at or before it (a merge is recorded up to a
 * few minutes after its block ends), else the first one after it.
 */
export function blockAt(db: Database, sessionId: string, ts: number): number | null {
  return (
    db
      .query<{ id: number }, [string, number]>(
        `SELECT id FROM segments WHERE session_id = ?1
         ORDER BY start <= ?2 DESC, CASE WHEN start <= ?2 THEN -start ELSE start END LIMIT 1`,
      )
      .get(sessionId, ts)?.id ?? null
  );
}

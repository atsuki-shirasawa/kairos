// What is left to pick up: each recent session's latest summary, with the items it left that are
// still open. The page ranks and caps them; this only finds them.
import type { Database } from "bun:sqlite";
import type { PickUpItem, PickUpSession } from "../../shared/api.ts";
import { PICK_UP_IDLE_DAYS } from "../../shared/constants.ts";
import { DAY } from "../../shared/dates.ts";
import { parseSummaryBody } from "../../shared/summaryBody.ts";
import { ITEM_SELECT, type ItemRow, itemOf } from "../summarize/ledger/items.ts";

/** A session's latest summarized block, as `latestBlocks` reads it. */
type LatestRow = {
  session_id: string;
  project_id: number | null;
  launch_cwd: string | null;
  ended_at: number;
  block_id: number;
  start: number;
  end: number;
  headline: string;
  body: string;
};

/**
 * Human sessions active since `since` whose latest summarized block left items still open. A block
 * not summarized yet doesn't count: the latest summary is the latest word on where the session
 * stands. A session continued in another is left out: the work goes on there, and resuming it
 * would pick up the superseded one. `visible` is the calendar's condition on sessions aliased `s`.
 */
function latestBlocks(db: Database, visible: string, since: number): LatestRow[] {
  return db
    .query<LatestRow, [number]>(
      `SELECT s.id AS session_id, s.project_id, s.launch_cwd, s.ended_at, g.id AS block_id,
         g.start, g.end, sm.headline, sm.body
       FROM sessions s
       JOIN segments g ON g.session_id = s.id AND g.start = (
         SELECT MAX(g2.start) FROM segments g2 JOIN summaries s2 ON s2.block_id = g2.id
         WHERE g2.session_id = s.id)
       JOIN summaries sm ON sm.block_id = g.id
       WHERE s.ended_at >= ? AND s.prompt_count > 0 AND s.continued_in IS NULL AND ${visible}
         AND EXISTS (SELECT 1 FROM open_items i WHERE i.block_id = g.id AND i.closed_at IS NULL)`,
    )
    .all(since);
}

/**
 * The still open items of the given blocks, by session (each block is its session's latest), in
 * the order each summary listed them.
 */
function openItemsOf(db: Database, blockIds: number[]): Map<string, PickUpItem[]> {
  const rows = db
    .query<ItemRow, [string]>(
      `${ITEM_SELECT}
       WHERE g.id IN (SELECT value FROM json_each(?)) AND i.closed_at IS NULL
       ORDER BY i.id`,
    )
    .all(JSON.stringify(blockIds));
  const bySession = new Map<string, PickUpItem[]>();
  for (const r of rows) {
    const { headline: _, ...item } = itemOf(r);
    bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), item]);
  }
  return bySession;
}

/** When each project last had human work since `since`, by project. */
function projectsMoved(db: Database, visible: string, since: number): Map<number, number> {
  const rows = db
    .query<{ project_id: number; moved: number }, [number]>(
      `SELECT s.project_id, MAX(s.ended_at) AS moved FROM sessions s
       WHERE s.ended_at >= ? AND s.prompt_count > 0 AND s.project_id IS NOT NULL AND ${visible}
       GROUP BY s.project_id`,
    )
    .all(since);
  return new Map(rows.map((r) => [r.project_id, r.moved]));
}

/**
 * Sessions active in the last `PICK_UP_IDLE_DAYS` whose latest summary left items still open, the
 * most recent first. `visible` is the calendar's condition on sessions aliased `s`.
 */
export function pickUpSessions(db: Database, visible: string, now: number): PickUpSession[] {
  const since = now - PICK_UP_IDLE_DAYS * DAY;
  const latest = latestBlocks(db, visible, since);
  const items = openItemsOf(
    db,
    latest.map((r) => r.block_id),
  );
  const moved = projectsMoved(db, visible, since);
  return latest
    .map((r) => ({
      sessionId: r.session_id,
      projectId: r.project_id,
      launchCwd: r.launch_cwd,
      start: r.start,
      end: r.end,
      headline: r.headline,
      next: parseSummaryBody(r.body)?.next ?? null,
      lastActive: r.ended_at,
      projectMovedAt: r.project_id === null ? null : (moved.get(r.project_id) ?? null),
      items: items.get(r.session_id) ?? [],
    }))
    .sort((a, b) => b.lastActive - a.lastActive);
}

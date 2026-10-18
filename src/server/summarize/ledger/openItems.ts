// Reads and hand-edits of the open-items ledger (`open_items`) for the API and recaps. The
// summarizer fills and closes items in `record.ts` and `settle.ts`; this is what the UI sees of them.
import type { Database } from "bun:sqlite";
import type { HandClose, LedgerEntry, OpenItemUpdate } from "../../../shared/api.ts";
import { closedByHand, HAND_CLOSES } from "../../../shared/openItems.ts";
import { sqlList } from "../../db/sqlList.ts";
import { SECTION_CLOSERS } from "./closers.ts";
import { entryOf, ITEM_SELECT, type ItemRow } from "./items.ts";
import { closeByRefs } from "./settle.ts";

/**
 * Items of human work open at some point in [from, to): left open before `to` and not closed
 * before `from`. Headless runs are left out, like recaps leave them out. With `projectId`, only
 * that project's. Oldest first.
 */
export function openItemsIn(
  db: Database,
  from: number,
  to: number,
  projectId?: number,
): LedgerEntry[] {
  return db
    .query<ItemRow, [number, number, number]>(
      `${ITEM_SELECT}
       WHERE s.prompt_count > 0 AND i.opened_at < ?2 AND (i.closed_at IS NULL OR i.closed_at >= ?1)
         AND (?3 < 0 OR s.project_id = ?3)
       ORDER BY i.opened_at, i.id`,
    )
    .all(from, to, projectId ?? -1)
    .map(entryOf);
}

/**
 * Earlier items each section of a session settled (by the log or its summary), by section start,
 * in the order they were opened. One query for the whole session: most sections settle nothing.
 */
export function sessionCloses(db: Database, sessionId: string): Map<number, LedgerEntry[]> {
  const rows = db
    .query<ItemRow, [string]>(
      `${ITEM_SELECT}
       WHERE c.session_id = ? AND i.closed_by IN ${sqlList(SECTION_CLOSERS)}
       ORDER BY i.opened_at, i.id`,
    )
    .all(sessionId);
  return groupBySection(rows, (r) => r.closed_start);
}

/**
 * Items each section of a session left open, by section start, in the order the summary listed
 * them, with how each stands now. One query for the whole session, as for `sessionCloses`.
 */
export function sessionOpens(db: Database, sessionId: string): Map<number, LedgerEntry[]> {
  const rows = db
    .query<ItemRow, [string]>(`${ITEM_SELECT} WHERE g.session_id = ? ORDER BY g.start, i.id`)
    .all(sessionId);
  return groupBySection(rows, (r) => r.start);
}

/** Rows as entries by the section start `startOf` picks, in row order; rows without one are left out. */
function groupBySection(
  rows: ItemRow[],
  startOf: (r: ItemRow) => number | null,
): Map<number, LedgerEntry[]> {
  const bySection = new Map<number, LedgerEntry[]>();
  for (const r of rows) {
    const start = startOf(r);
    if (start === null) continue;
    const list = bySection.get(start) ?? [];
    list.push(entryOf(r));
    bySection.set(start, list);
  }
  return bySection;
}

/** Why a hand edit was refused: no such item, or it can't move to that state. */
export type UpdateRefusal = "not found" | "conflict";

/** The item as the API returns it, or null when there is none. */
function loadEntry(db: Database, id: number): LedgerEntry | null {
  const row = db.query<ItemRow, [number]>(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
  return row ? entryOf(row) : null;
}

/** Reopens an item, clearing how it was closed. */
function reopen(db: Database, id: number): void {
  db.query(
    `UPDATE open_items SET closed_at = NULL, closed_block_id = NULL, closed_by = NULL,
       closed_note = NULL WHERE id = ?`,
  ).run(id);
}

/** Closes an item by hand: done, dismissed, or mistaken. */
function closeByHand(db: Database, id: number, state: HandClose, now: number): void {
  db.query(
    `UPDATE open_items SET closed_at = ?, closed_block_id = NULL, closed_by = ?,
       closed_note = NULL WHERE id = ?`,
  ).run(now, HAND_CLOSES[state], id);
}

/** Records a hand edit in the decision log, with a copy of the item it was made on. */
function logDecision(db: Database, entry: LedgerEntry, update: OpenItemUpdate, now: number): void {
  db.query(
    `INSERT INTO open_item_decisions (item_id, session_id, start, kind, text, state, at)
     VALUES ($id, $sessionId, $start, $kind, $text, $state, $at)`,
  ).run({
    id: entry.id,
    sessionId: entry.sessionId,
    start: entry.start,
    kind: entry.kind,
    text: entry.text,
    state: update.state,
    at: now,
  });
}

/**
 * Closes an open item by hand (done, dismissed or mistaken), or reopens one closed by hand, and
 * logs the decision. An item the log or a summary closed stays closed: the next check would close
 * it again. Closing one already closed is refused too, so a click on a stale list doesn't overwrite
 * how it was closed.
 */
export function updateOpenItem(
  db: Database,
  id: number,
  update: OpenItemUpdate,
  now: number,
): LedgerEntry | UpdateRefusal {
  return db.transaction(() => {
    const entry = loadEntry(db, id);
    if (!entry) return "not found";
    if (update.state === "open") {
      if (!closedByHand(entry.closedBy)) return "conflict";
      reopen(db, id);
      // The log may have settled it while it was closed by hand, which the check skipped
      closeByRefs(db, entry.sessionId);
    } else {
      if (entry.closedAt !== null) return "conflict";
      closeByHand(db, id, update.state, now);
    }
    logDecision(db, entry, update, now);
    return loadEntry(db, id) ?? "not found";
  })();
}

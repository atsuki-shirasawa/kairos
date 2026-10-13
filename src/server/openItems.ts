// Reads and hand-edits of the open-items ledger (`open_items`) for the API and recaps. The
// summarizer fills and closes items in `summarize/ledger.ts`; this is what the UI sees of them.
import type { Database } from "bun:sqlite";
import type { ClosedBy, LedgerEntry, OpenItemUpdate } from "../shared/api.ts";
import { OPEN_KINDS, type OpenKind } from "../shared/summaryBody.ts";
import { closeByRefs } from "./summarize/ledger.ts";

type EntryRow = {
  id: number;
  project_id: number | null;
  kind: string | null;
  text: string;
  session_id: string;
  start: number;
  opened_at: number;
  closed_at: number | null;
  closed_by: string | null;
  closed_session_id: string | null;
  closed_start: number | null;
  closed_note: string | null;
};

const ENTRY_SELECT = `SELECT i.id, s.project_id, i.kind, i.text, i.session_id, i.start, i.opened_at,
       i.closed_at, i.closed_by, i.closed_session_id, i.closed_start, i.closed_note
  FROM open_items i JOIN sessions s ON s.id = i.session_id`;

const CLOSERS: readonly string[] = ["ref", "model", "user", "dismissed"];

function entryOf(r: EntryRow): LedgerEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    // Rows hold what the summary parser wrote, but a value from elsewhere shouldn't reach the UI
    kind: (OPEN_KINDS as readonly string[]).includes(r.kind ?? "") ? (r.kind as OpenKind) : null,
    text: r.text,
    sessionId: r.session_id,
    start: r.start,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    closedBy: CLOSERS.includes(r.closed_by ?? "") ? (r.closed_by as ClosedBy) : null,
    closedSessionId: r.closed_session_id,
    closedStart: r.closed_start,
    closedNote: r.closed_note,
  };
}

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
    .query<EntryRow, [number, number, number]>(
      `${ENTRY_SELECT}
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
  const closes = new Map<number, LedgerEntry[]>();
  const rows = db
    .query<EntryRow, [string]>(
      `${ENTRY_SELECT}
       WHERE i.closed_session_id = ? AND i.closed_by IN ('ref', 'model')
       ORDER BY i.opened_at, i.id`,
    )
    .all(sessionId);
  for (const r of rows) {
    if (r.closed_start === null) continue;
    const list = closes.get(r.closed_start) ?? [];
    list.push(entryOf(r));
    closes.set(r.closed_start, list);
  }
  return closes;
}

/** Why a hand edit was refused: no such item, or it can't move to that state. */
export type UpdateRefusal = "not found" | "conflict";

/**
 * Closes an open item by hand (done or dismissed), or reopens one closed by hand. An item the log
 * or a summary closed stays closed: the next check would close it again. Closing one already
 * closed is refused too, so a click on a stale list doesn't overwrite how it was closed.
 */
export function updateOpenItem(
  db: Database,
  id: number,
  update: OpenItemUpdate,
  now: number,
): LedgerEntry | UpdateRefusal {
  const row = db.query<EntryRow, [number]>(`${ENTRY_SELECT} WHERE i.id = ?`).get(id);
  if (!row) return "not found";
  if (update.state === "open") {
    if (row.closed_by !== "user" && row.closed_by !== "dismissed") return "conflict";
    db.query(
      `UPDATE open_items SET closed_at = NULL, closed_session_id = NULL, closed_start = NULL,
         closed_by = NULL, closed_note = NULL WHERE id = ?`,
    ).run(id);
    // The log may have settled it while it was closed by hand, which the check skipped
    closeByRefs(db, row.session_id);
  } else {
    if (row.closed_at !== null) return "conflict";
    db.query(
      `UPDATE open_items SET closed_at = ?, closed_session_id = NULL, closed_start = NULL,
         closed_by = ?, closed_note = NULL WHERE id = ?`,
    ).run(now, update.state === "done" ? "user" : "dismissed", id);
  }
  const updated = db.query<EntryRow, [number]>(`${ENTRY_SELECT} WHERE i.id = ?`).get(id);
  return updated ? entryOf(updated) : "not found";
}

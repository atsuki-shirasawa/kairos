// A thread as the page shows it: the sessions tied to one (see `threadMembers`) with all their
// blocks as the calendar has them, and the items those blocks left open.
import type { Database } from "bun:sqlite";
import type { LedgerEntry, Thread } from "../../shared/api.ts";
import { entryOf, ITEM_SELECT, type ItemRow } from "../summarize/ledger/items.ts";
import { calendarSessionsByIds } from "./calendar.ts";
import { threadMembers } from "./threadMembers.ts";

/** Items the given sessions' blocks left open, open or closed since, oldest first. */
function itemsOpenedIn(db: Database, ids: readonly string[]): LedgerEntry[] {
  return db
    .query<ItemRow, [string]>(
      `${ITEM_SELECT}
       WHERE g.session_id IN (SELECT value FROM json_each(?1))
       ORDER BY i.opened_at, i.id`,
    )
    .all(JSON.stringify(ids))
    .map(entryOf);
}

/** Which of the sessions are visible. */
function visibleOf(db: Database, visible: string, ids: readonly string[]): Set<string> {
  const rows = db
    .query<{ id: string }, [string]>(
      `SELECT s.id FROM sessions s WHERE s.id IN (SELECT value FROM json_each(?1)) AND ${visible}`,
    )
    .all(JSON.stringify(ids));
  return new Set(rows.map((r) => r.id));
}

/**
 * The items with a close by a hidden session kept as how it closed but not which block closed it,
 * so the thread neither links to hidden work nor says that it touched this one.
 */
function withoutHiddenClosers(db: Database, visible: string, items: LedgerEntry[]): LedgerEntry[] {
  const closers = [...new Set(items.flatMap((i) => i.closedSessionId ?? []))];
  const shown = visibleOf(db, visible, closers);
  return items.map((i) =>
    i.closedSessionId === null || shown.has(i.closedSessionId)
      ? i
      : { ...i, closedSessionId: null, closedStart: null },
  );
}

/**
 * The thread the session belongs to: its visible sessions with every block, how each came in, and
 * the items its blocks left open. Null when the session isn't a visible one.
 */
export function threadOf(db: Database, visible: string, seed: string, now: number): Thread | null {
  const members = threadMembers(db, visible, seed);
  if (!members) return null;
  return {
    seed,
    sessions: calendarSessionsByIds(db, members.ids, now),
    links: members.links,
    openItems: withoutHiddenClosers(db, visible, itemsOpenedIn(db, members.ids)),
    truncated: members.truncated,
  };
}

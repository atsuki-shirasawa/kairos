// Applying a summarized section to the ledger: the items it left open and the earlier ones it said
// it settled, replacing whatever an earlier summary of the same section recorded.
import type { Database } from "bun:sqlite";
import type { OpenItem } from "../../../shared/summaryBody.ts";
import { sqlList } from "../../db/sqlList.ts";
import { itemRefs } from "../../refs.ts";
import type { TaskState } from "../../tasks.ts";
import type { PlacedSection } from "../blocks.ts";
import { CLOSED_BY, KEPT_CLOSERS } from "./closers.ts";
import { closeByRefs } from "./settle.ts";

/** What a summarized section changes in the ledger. */
export interface LedgerUpdate {
  /** End of the section as summarized. */
  end: number;
  /** The summary's Open items; none for a headline-only summary. */
  opened: OpenItem[];
  /** Tasks in the session at the section's end, to tie an item to the task it names. */
  tasks: TaskState[];
  /** Earlier items the model said this section settled, by ID. */
  closed: { id: number; note: string }[];
}

/**
 * How an item was closed after the section that opened it: by a later section's summary or by
 * hand. Kept across a rewrite of the opening section.
 */
type LaterClosure = {
  closed_at: number;
  closed_block_id: number | null;
  closed_by: string;
  closed_note: string | null;
};

/** Text compared loosely, so a regenerated item with the same wording finds its closure again. */
const sameText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Applies a summarized section to the ledger: replaces what an earlier summary of it opened and
 * reopens what that summary closed, records its open items and closures, then closes whatever the
 * log shows settled. Run in the same transaction as saving the summary.
 */
export function recordSection(db: Database, target: PlacedSection, update: LedgerUpdate): void {
  reopenClosedBy(db, target);
  const kept = laterClosures(db, target);
  deleteOpenedBy(db, target);
  insertOpened(db, target, update, kept);
  closeOnModelsWord(db, target, update);
  closeByRefs(db, target.sessionId);
}

/** Reopens the items an earlier summary of the section said it settled. */
function reopenClosedBy(db: Database, target: PlacedSection): void {
  db.query(
    `UPDATE open_items SET closed_at = NULL, closed_block_id = NULL, closed_by = NULL,
       closed_note = NULL
     WHERE closed_by = '${CLOSED_BY.model}' AND closed_block_id = ?`,
  ).run(target.blockId);
}

/**
 * Closures of the items this section opened, by item text, other than the log's (rechecked after
 * every save anyway) and this section's own: a later section's summary or a hand edit. The rows
 * are replaced when the section is regenerated; an item worded the same keeps its closure.
 */
function laterClosures(db: Database, target: PlacedSection): Map<string, LaterClosure> {
  const rows = db
    .query<LaterClosure & { text: string }, [number]>(
      `SELECT text, closed_at, closed_block_id, closed_by, closed_note
       FROM open_items
       WHERE block_id = ?1 AND closed_by IN ${sqlList(KEPT_CLOSERS)}
         AND NOT (closed_by = '${CLOSED_BY.model}' AND closed_block_id IS ?1)`,
    )
    .all(target.blockId);
  return new Map(rows.map((r) => [sameText(r.text), r]));
}

/** Deletes the items an earlier summary of the section opened. */
function deleteOpenedBy(db: Database, target: PlacedSection): void {
  db.query("DELETE FROM open_items WHERE block_id = ?").run(target.blockId);
}

/** Inserts the section's open items, each with its refs and any closure its wording kept. */
function insertOpened(
  db: Database,
  target: PlacedSection,
  update: LedgerUpdate,
  kept: Map<string, LaterClosure>,
): void {
  const insert = db.query(
    `INSERT INTO open_items (block_id, opened_at, kind, text, refs, closed_at, closed_block_id,
       closed_by, closed_note)
     VALUES ($blockId, $openedAt, $kind, $text, $refs, $closedAt, $closedBlockId, $closedBy,
       $closedNote)`,
  );
  for (const item of update.opened) {
    const closure = kept.get(sameText(item.text));
    insert.run({
      blockId: target.blockId,
      openedAt: update.end,
      kind: item.kind,
      text: item.text,
      refs: JSON.stringify(itemRefs(item.text, update.tasks)),
      closedAt: closure?.closed_at ?? null,
      closedBlockId: closure?.closed_block_id ?? null,
      closedBy: closure?.closed_by ?? null,
      closedNote: closure?.closed_note ?? null,
    });
  }
}

/** Closes the earlier items the model said the section settled, unless already closed. */
function closeOnModelsWord(db: Database, target: PlacedSection, update: LedgerUpdate): void {
  const close = db.query(
    `UPDATE open_items SET closed_at = ?, closed_block_id = ?, closed_by = '${CLOSED_BY.model}',
       closed_note = ?
     WHERE id = ? AND closed_at IS NULL`,
  );
  for (const c of update.closed) close.run(update.end, target.blockId, c.note || null, c.id);
}

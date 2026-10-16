// An `open_items` row as every ledger query reads it, and its one mapping to the domain types.
import type { LedgerEntry } from "../../../shared/api.ts";
import { OPEN_KINDS, type OpenKind } from "../../../shared/summaryBody.ts";
import { isClosedBy } from "./closers.ts";

/** An item as the summarizer reads it: the API's entry plus its refs and its section's headline. */
export interface LedgerItem extends LedgerEntry {
  /** Issue / PR numbers, Jira keys and task IDs the item names (see `refs.ts`). */
  refs: string[];
  /** Headline of the section that opened it, when it has one. */
  headline: string | null;
}

/** An `open_items` row with its session's project and its opening section's headline. */
export type ItemRow = {
  id: number;
  project_id: number | null;
  session_id: string;
  start: number;
  opened_at: number;
  kind: string | null;
  text: string;
  refs: string;
  closed_at: number | null;
  closed_by: string | null;
  closed_session_id: string | null;
  closed_start: number | null;
  closed_note: string | null;
  headline: string | null;
};

/**
 * Selects `ItemRow`s. Aliases are free for WHERE clauses: `i` (the item), `g` (the block that
 * opened it), `s` (its session) and `c` (the block that closed it, when one did).
 */
export const ITEM_SELECT = `SELECT i.id, s.project_id, g.session_id, g.start, i.opened_at, i.kind,
       i.text, i.refs, i.closed_at, i.closed_by, c.session_id AS closed_session_id,
       c.start AS closed_start, i.closed_note, sm.headline
  FROM open_items i
  JOIN segments g ON g.id = i.block_id
  JOIN sessions s ON s.id = g.session_id
  LEFT JOIN segments c ON c.id = i.closed_block_id
  LEFT JOIN summaries sm ON sm.block_id = i.block_id`;

/** A stored kind, when it is one the summary format knows. */
function kindOf(kind: string | null): OpenKind | null {
  // Rows hold what the summary parser wrote, but a value from elsewhere shouldn't reach the UI
  return (OPEN_KINDS as readonly string[]).includes(kind ?? "") ? (kind as OpenKind) : null;
}

/** The refs column (a JSON array of strings), tolerating a damaged value as no refs. */
function parseRefs(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  } catch {}
  return [];
}

/** A row as the summarizer and the API read it. The API takes the `LedgerEntry` part. */
export function itemOf(r: ItemRow): LedgerItem {
  return { ...entryOf(r), refs: parseRefs(r.refs), headline: r.headline };
}

/** A row as the API returns it. */
export function entryOf(r: ItemRow): LedgerEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: kindOf(r.kind),
    text: r.text,
    sessionId: r.session_id,
    start: r.start,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    closedBy: isClosedBy(r.closed_by) ? r.closed_by : null,
    closedSessionId: r.closed_session_id,
    closedStart: r.closed_start,
    closedNote: r.closed_note,
  };
}

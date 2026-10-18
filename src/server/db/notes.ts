// Claude Code's notes about the work, stored as messages beside the work itself.
import { sqlList } from "./sqlList.ts";

/**
 * Message kinds that are Claude Code's notes about the work rather than the work itself. A recap is
 * written minutes after the last activity, so counting notes would stretch blocks and sessions.
 */
export const NOTE_KINDS = ["compact_summary", "away_summary"] as const;

/**
 * SQL condition that leaves notes out, for queries about the work or the conversation. Pass the
 * qualified column (`m.kind`) when the query joins another table.
 */
export function notNote(column = "kind"): string {
  return `${column} NOT IN ${sqlList(NOTE_KINDS)}`;
}

// The end of a conversation's log, read the same way for a session's main conversation and for
// each of its subagents to find the call in flight.
import type { Database } from "bun:sqlite";
import type { LiveTool } from "../../shared/api.ts";
import { oneLine } from "../text.ts";

/** How long a call's one-line summary may run on a card. */
const TOOL_TEXT_CHARS = 160;

/** One message from the end of a conversation's log. `meta` is a call's input as stored. */
export interface TailRow {
  kind: string;
  tool_name: string | null;
  tool_use_id: string | null;
  text: string | null;
  meta: string | null;
  ts: number | null;
}

/**
 * The last `limit` messages of one conversation of the session, newest first: the main one when
 * `agentId` is null, else that subagent's. Copies from a continued session are left out.
 */
export function logTail(
  db: Database,
  sessionId: string,
  agentId: string | null,
  limit: number,
): TailRow[] {
  return db
    .query<TailRow, { session: string; agent: string | null; limit: number }>(
      `SELECT kind, tool_name, tool_use_id, text, meta, ts FROM messages
       WHERE session_id = $session AND agent_id IS $agent AND is_copy = 0
       ORDER BY file_id DESC, seq DESC LIMIT $limit`,
    )
    .all({ session: sessionId, agent: agentId, limit });
}

/** A `tool_use` row as the call a card shows. */
export function toolOf(r: TailRow): LiveTool {
  return {
    name: r.tool_name ?? "",
    text: oneLine(r.text ?? "", TOOL_TEXT_CHARS),
    since: r.ts ?? 0,
  };
}

// The end of a conversation's log, read the same way for a session's main conversation and for
// each of its subagents to find the call in flight, and the rows around a message in it.
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

/** Where a message sits in its conversation's log, the order `messages_order` keeps. */
export interface LogPosition {
  file_id: number;
  seq: number;
}

/**
 * The rows of one conversation of the session: the main one when `$agent` is null, else that
 * subagent's. Copies from a continued session are left out.
 */
const CONVERSATION_ROWS = "session_id = $session AND agent_id IS $agent AND is_copy = 0";
const TAIL_COLUMNS = "kind, tool_name, tool_use_id, text, meta, ts";

/** The last `limit` messages of one conversation of the session, newest first. */
export function logTail(
  db: Database,
  sessionId: string,
  agentId: string | null,
  limit: number,
): TailRow[] {
  return db
    .query<TailRow, { session: string; agent: string | null; limit: number }>(
      `SELECT ${TAIL_COLUMNS} FROM messages WHERE ${CONVERSATION_ROWS}
       ORDER BY file_id DESC, seq DESC LIMIT $limit`,
    )
    .all({ session: sessionId, agent: agentId, limit });
}

/** Which way from a message `logAround` reads. */
export type LogSide = "before" | "after";

/** Up to `limit` messages of one conversation next to the one at `at`, nearest first. */
export function logAround(
  db: Database,
  read: {
    sessionId: string;
    agentId: string | null;
    at: LogPosition;
    side: LogSide;
    limit: number;
  },
): TailRow[] {
  const [cmp, order] = read.side === "before" ? ["<", "DESC"] : [">", "ASC"];
  return db
    .query<
      TailRow,
      { session: string; agent: string | null; file: number; seq: number; limit: number }
    >(
      `SELECT ${TAIL_COLUMNS} FROM messages
       WHERE ${CONVERSATION_ROWS} AND (file_id, seq) ${cmp} ($file, $seq)
       ORDER BY file_id ${order}, seq ${order} LIMIT $limit`,
    )
    .all({
      session: read.sessionId,
      agent: read.agentId,
      file: read.at.file_id,
      seq: read.at.seq,
      limit: read.limit,
    });
}

/** A `tool_use` row as the call a card shows. */
export function toolOf(r: TailRow): LiveTool {
  return {
    name: r.tool_name ?? "",
    text: oneLine(r.text ?? "", TOOL_TEXT_CHARS),
    since: r.ts ?? 0,
  };
}

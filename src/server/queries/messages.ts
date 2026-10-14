// A session's conversation, page by page, in file order. Pages are keyed by a `fileId:seq` cursor
// so a page boundary stays put while the log grows.
import type { Database } from "bun:sqlite";
import type { Message, MessageKind, MessagesResponse } from "../../shared/api.ts";
import { notNote } from "../db/notes.ts";

/** Messages returned per page when the request gives no `limit`. */
export const MESSAGES_DEFAULT_LIMIT = 200;
/** Upper bound on a requested `limit`, so one request cannot pull a whole long session. */
export const MESSAGES_MAX_LIMIT = 1000;

/** Which page of which conversation to read. */
export interface MessagesOptions {
  /** A subagent's conversation instead of the main one. */
  agent?: string | null;
  /** Where the previous page ended (its `nextCursor`); the first page when absent. */
  cursor?: string | null;
  limit?: number;
  /** Also include copies from the session this one continued. */
  copies?: boolean;
}

/** A messages row as a page reads it. */
interface MessageRow {
  id: string;
  file_id: number;
  seq: number;
  ts: number | null;
  kind: MessageKind;
  text: string | null;
  tool_name: string | null;
  tool_use_id: string | null;
  meta: string | null;
  is_error: number;
  is_scheduled: number;
  is_copy: number;
}

/** A position in a conversation: the message's file and its sequence number within that file. */
export interface CursorPosition {
  fileId: number;
  seq: number;
}

/** Before the first message of any file, where a conversation without a cursor starts. */
const START: CursorPosition = { fileId: -1, seq: -1 };

/** Reads a `fileId:seq` cursor; a missing or malformed one starts from the beginning. */
export function parseCursor(cursor: string | null | undefined): CursorPosition {
  const m = /^(\d+):(\d+)$/.exec(cursor ?? "");
  return m ? { fileId: Number(m[1]), seq: Number(m[2]) } : START;
}

/** The cursor for the page after the message at `position`. */
export function encodeCursor(position: CursorPosition): string {
  return `${position.fileId}:${position.seq}`;
}

/** The requested page size, within 1..`MESSAGES_MAX_LIMIT`. */
export function pageLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? MESSAGES_DEFAULT_LIMIT, 1), MESSAGES_MAX_LIMIT);
}

/** A messages row as the API reports it. */
function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind,
    text: r.text,
    toolName: r.tool_name,
    toolUseId: r.tool_use_id,
    detail: r.meta,
    isError: r.is_error === 1,
    isScheduled: r.is_scheduled === 1,
    isCopy: r.is_copy === 1,
  };
}

/**
 * One page of the conversation in file order. With `agent`, that subagent's conversation.
 * Copies from the previous session are included only when `copies` is true.
 */
export function messagesPage(
  db: Database,
  sessionId: string,
  opts: MessagesOptions = {},
): MessagesResponse {
  const limit = pageLimit(opts.limit);
  const after = parseCursor(opts.cursor);
  // One row past the page tells whether there is a next page
  const rows = db
    .query<MessageRow, [string, string | null, number, number, number, number]>(
      `SELECT id, file_id, seq, ts, kind, text, tool_name, tool_use_id, meta, is_error, is_scheduled, is_copy
       FROM messages
       WHERE session_id = ?1 AND agent_id IS ?2 AND (is_copy = 0 OR ?5 = 1) AND ${notNote()}
         AND (file_id > ?3 OR (file_id = ?3 AND seq > ?4))
       ORDER BY file_id, seq
       LIMIT ?6`,
    )
    .all(sessionId, opts.agent ?? null, after.fileId, after.seq, opts.copies ? 1 : 0, limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    messages: page.map(toMessage),
    nextCursor:
      rows.length > limit && last ? encodeCursor({ fileId: last.file_id, seq: last.seq }) : null,
  };
}

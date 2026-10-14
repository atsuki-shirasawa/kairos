// Main-conversation tool calls read back from the DB with their results. Shared by the summaries'
// facts, the open-items ledger and the live page, so none of them imports another's internals.
import type { Database } from "bun:sqlite";

/** A main-conversation tool call with its result. */
export interface ToolCall {
  ts: number;
  toolName: string;
  /** One-line summary stored with the call (the Bash command, for example). */
  text: string;
  /** The call's input as stored (JSON, possibly cut short). */
  input: string | null;
  result: string | null;
  isError: boolean;
}

/** A tool call's row as `selectCalls` reads it. */
type CallRow = {
  ts: number;
  tool_name: string;
  text: string | null;
  meta: string | null;
  result: string | null;
  is_error: number | null;
};

/** The call's input as a JSON object, or null when it is missing, cut short or not an object. */
export function toolInput(c: Pick<ToolCall, "input">): Record<string, unknown> | null {
  if (!c.input) return null;
  try {
    const v: unknown = JSON.parse(c.input);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A field of a call's input when it is a non-empty string, else null. */
export const stringField = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The Bash command of a call: the full one from its input when it parses, else the summary. */
export function commandOf(c: ToolCall): string {
  return stringField(toolInput(c)?.command) ?? c.text;
}

/** A stored call row as a `ToolCall`. */
export function callOf(r: Omit<CallRow, "tool_name">, toolName: string): ToolCall {
  return {
    ts: r.ts,
    toolName,
    text: r.text ?? "",
    input: r.meta,
    result: r.result,
    isError: r.is_error === 1,
  };
}

/** The main conversation's non-scheduled tool calls in [from, to] that also match `where`. */
function selectCalls(
  db: Database,
  where: string,
  sessionId: string,
  from: number,
  to: number,
): ToolCall[] {
  return db
    .query<CallRow, [string, number, number]>(
      `SELECT m.ts, m.tool_name, m.text, m.meta, r.text AS result, r.is_error
       FROM messages m
       LEFT JOIN messages r ON r.session_id = m.session_id AND r.kind = 'tool_result'
         AND r.tool_use_id = m.tool_use_id AND r.agent_id IS NULL
       WHERE m.session_id = ? AND m.kind = 'tool_use' AND m.agent_id IS NULL
         AND m.is_scheduled = 0 AND m.ts BETWEEN ? AND ? ${where}
       ORDER BY m.file_id, m.seq`,
    )
    .all(sessionId, from, to)
    .map((r) => callOf(r, r.tool_name));
}

/** The main conversation's own tool calls in [from, to] with their results, copies left out. */
export function loadToolCalls(
  db: Database,
  sessionId: string,
  from: number,
  to: number,
): ToolCall[] {
  return selectCalls(db, "AND m.is_copy = 0", sessionId, from, to);
}

/**
 * The session's TaskCreate / TaskUpdate calls up to `to`, copies included: a continued session
 * carries on the tasks the previous one created.
 */
export function loadTaskCalls(db: Database, sessionId: string, to: number): ToolCall[] {
  return selectCalls(db, "AND m.tool_name IN ('TaskCreate', 'TaskUpdate')", sessionId, 0, to);
}

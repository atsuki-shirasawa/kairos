// A batch of subagents launched together, read from the main conversation: Claude Code writes the
// parallel calls of one response as consecutive rows, so the calls around a launch that no result
// or prompt separates from it came in the same response.
import type { Database } from "bun:sqlite";
import type { LiveAgent, LiveFanOut, MessageKind } from "../../shared/api.ts";
import { AGENT_TOOLS } from "../agentTools.ts";
import { sqlList } from "../db/sqlList.ts";
import { type LogPosition, type LogSide, logAround, type TailRow } from "./tail.ts";

const LAUNCH_TOOLS: ReadonlySet<string> = new Set(AGENT_TOOLS);
/**
 * Rows that can sit between the calls of one response: its other calls and its text. A result
 * ends it: in real logs a response's results follow all of its calls, and letting them through
 * would run on into the response before.
 */
const SAME_RESPONSE_KINDS: ReadonlySet<string> = new Set<MessageKind>(["tool_use", "assistant"]);
/**
 * How many rows to read on each side of a launch: wider than any batch Claude Code runs at once
 * (it caps parallel tools at 10 by default), text between the calls included.
 */
const NEIGHBOR_ROWS = 40;

/** A running subagent launched by a call, with that call's id. */
type Launched = LiveAgent & { callId: string };

/**
 * How far the batch of the newest running subagent launched from the main conversation has got,
 * when that batch launched two or more. `agents` is what `liveAgents` listed; `since` bounds the
 * search for the launch call (the current work block's start), since a subagent may start well
 * after its call when Claude Code queues a wide batch.
 */
export function fanOutOf(
  db: Database,
  sessionId: string,
  agents: readonly LiveAgent[],
  since: number,
): LiveFanOut | null {
  const running = launchedRunning(agents);
  for (const agent of running) {
    // A subagent's own helpers are launched from its log, not the main one: try the next
    const at = launchPosition(db, sessionId, agent.callId, since);
    if (!at) continue;
    const calls = batchAround(db, sessionId, agent.callId, at);
    const started = startedCalls(db, sessionId, calls);
    return batchProgress(calls, started, new Set(running.map((a) => a.callId)));
  }
  return null;
}

/** The running subagents a call launched, newest first. */
export function launchedRunning(agents: readonly LiveAgent[]): Launched[] {
  return agents
    .filter((a): a is Launched => a.running && a.callId !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * A batch's progress: a subagent counts as done once it was started and no longer runs; one not
 * started yet (its log or meta file not read) is still to come. None for a lone launch.
 */
export function batchProgress(
  calls: readonly string[],
  started: ReadonlySet<string>,
  running: ReadonlySet<string>,
): LiveFanOut | null {
  if (calls.length < 2) return null;
  const done = calls.filter((id) => started.has(id) && !running.has(id)).length;
  return { done, total: calls.length };
}

/** The launch calls made in the same response as `callId`, in the order they were made. */
function batchAround(db: Database, sessionId: string, callId: string, at: LogPosition): string[] {
  const side = (s: LogSide) =>
    launchesUntilBreak(
      logAround(db, { sessionId, agentId: null, at, side: s, limit: NEIGHBOR_ROWS }),
    );
  return [...side("before").reverse(), callId, ...side("after")];
}

/**
 * Where the launch call sits in the main log, or null when it isn't there. Kind and tool name
 * are in `messages_block`, so only launch calls are read from the table.
 */
function launchPosition(
  db: Database,
  sessionId: string,
  callId: string,
  since: number,
): LogPosition | null {
  return db
    .query<LogPosition, { session: string; since: number; call: string }>(
      `SELECT file_id, seq FROM messages
       WHERE session_id = $session AND ts >= $since AND is_copy = 0 AND kind = 'tool_use'
         AND tool_name IN ${sqlList(AGENT_TOOLS)} AND agent_id IS NULL AND tool_use_id = $call
       LIMIT 1`,
    )
    .get({ session: sessionId, since, call: callId });
}

/** The launch calls among `rows` up to the first row from outside the response. */
function launchesUntilBreak(rows: readonly TailRow[]): string[] {
  const ids: string[] = [];
  for (const r of rows) {
    if (!SAME_RESPONSE_KINDS.has(r.kind)) break;
    if (r.kind === "tool_use" && r.tool_use_id && LAUNCH_TOOLS.has(r.tool_name ?? ""))
      ids.push(r.tool_use_id);
  }
  return ids;
}

/** Which of the launch calls have a subagent Kairos has read, with at least one message. */
function startedCalls(db: Database, sessionId: string, calls: readonly string[]): Set<string> {
  const rows = db
    .query<{ tool_use_id: string }, string[]>(
      `SELECT a.tool_use_id FROM subagents a
       WHERE a.session_id = ? AND a.tool_use_id IN (${calls.map(() => "?").join(", ")})
         AND EXISTS (SELECT 1 FROM messages m
                     WHERE m.session_id = a.session_id AND m.agent_id = a.id)`,
    )
    .all(sessionId, ...calls);
  return new Set(rows.map((r) => r.tool_use_id));
}

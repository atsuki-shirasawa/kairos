// The subagents of a running session, read from their logs: Claude Code's registry lists only the
// session's process, so whether a subagent still runs is judged by how its log ends.
import type { Database } from "bun:sqlite";
import type { LiveAgent, LiveState, LiveTool } from "../../shared/api.ts";
import { MINUTE } from "../../shared/dates.ts";
import { tokensSql } from "../queries/usage.ts";
import { logTail, type TailRow, toolOf } from "./tail.ts";

/**
 * A subagent whose log has been quiet this long is taken as gone: one stopped from outside (Esc,
 * TaskStop) writes nothing that says so. Long enough for a slow build or test run.
 */
const STALE_MS = 15 * MINUTE;
/** How long a finished subagent stays listed. */
const DONE_KEEP_MS = 2 * MINUTE;
/**
 * How far back from the end of a subagent's log to look for the call in flight: enough for a wide
 * batch of parallel calls and their results.
 */
const TAIL_MESSAGES = 60;
/**
 * A reply this recent may be the text before a call still being written: Claude Code logs each
 * block of a response on its own, the call after the text. Only a reply older than this ends it.
 */
const REPLY_SETTLE_MS = MINUTE / 2;
/** The tool a subagent calls to hand its report back, which ends it. */
const HANDBACK_TOOL = "SubagentHandback";
/** Records after which the subagent has stopped: Esc, or an API error that ended its turn. */
const STOP_KINDS = new Set(["interrupt", "error"]);

interface MetaRow {
  agent_type: string | null;
  description: string | null;
  tool_use_id: string | null;
}

/** Whether a subagent still runs, judged from its log's tail, and the call it is in (null once done). */
interface Phase {
  running: boolean;
  tool: LiveTool | null;
}

/** The phase of a subagent that has stopped. */
const DONE: Phase = { running: false, tool: null };

/**
 * How a subagent's log ends as of `now`, newest row first. It is done after its handback call, a
 * reply with no call after it (once settled), or a stop; running while a call is in flight, or
 * after a result or a message it hasn't answered yet. Among parallel calls, the newest one without
 * a result is the one shown.
 */
export function phaseOf(tail: readonly TailRow[], now: number): Phase {
  const answered = new Set<string>();
  let calls = false;
  for (const r of tail) {
    if (r.kind === "tool_result") {
      if (calls) break; // Past the latest batch of calls: every one of them returned
      if (r.tool_use_id) answered.add(r.tool_use_id);
      continue;
    }
    if (r.kind === "tool_use") {
      if (r.tool_name === HANDBACK_TOOL) return DONE;
      calls = true;
      if (r.tool_use_id && !answered.has(r.tool_use_id)) return { running: true, tool: toolOf(r) };
      continue;
    }
    if (calls) break;
    if (STOP_KINDS.has(r.kind)) return DONE;
    if (r.kind === "assistant" && (r.ts ?? 0) <= now - REPLY_SETTLE_MS) return DONE;
    return { running: true, tool: null };
  }
  return { running: tail.length > 0, tool: null };
}

/**
 * Subagents of the session with a message in the last `STALE_MS`: running ones, then those done
 * within `DONE_KEEP_MS`, each group oldest first. `state` is the session's: once it waits for
 * the person, no subagent its turn waited on can still run.
 */
export function liveAgents(
  db: Database,
  sessionId: string,
  state: LiveState,
  now: number,
): LiveAgent[] {
  const recent = db
    .query<{ id: string; lastAt: number }, [string, number]>(
      `SELECT agent_id AS id, MAX(ts) AS lastAt FROM messages
       WHERE session_id = ? AND ts >= ? AND agent_id IS NOT NULL AND is_copy = 0
       GROUP BY agent_id`,
    )
    .all(sessionId, now - STALE_MS);
  const list: LiveAgent[] = [];
  for (const { id, lastAt } of recent) {
    const phase = phaseOf(logTail(db, sessionId, id, TAIL_MESSAGES), now);
    // Settled first: a fan-out leaves many done subagents, and these need nothing more read
    if (!phase.running && lastAt < now - DONE_KEEP_MS) continue;
    const meta = metaOf(db, id);
    const startedAt = startOf(db, sessionId, id) ?? lastAt;
    const background = isBackground(db, sessionId, meta, { startedAt, lastAt });
    // A call the turn waits on ends with the turn, whatever its log left behind
    const running = phase.running && (background || state !== "waiting");
    if (!running && lastAt < now - DONE_KEEP_MS) continue;
    list.push({
      id,
      agentType: meta?.agent_type ?? null,
      description: meta?.description ?? null,
      callId: meta?.tool_use_id ?? null,
      running,
      background,
      tool: running ? phase.tool : null,
      startedAt,
      lastAt,
      tokens: tokensOf(db, sessionId, id, startedAt),
    });
  }
  return list.sort((a, b) => Number(b.running) - Number(a.running) || a.startedAt - b.startedAt);
}

/** The subagent's type, description and the call that started it, from its meta file. */
function metaOf(db: Database, agentId: string): MetaRow | null {
  return db
    .query<MetaRow, [string]>(
      "SELECT agent_type, description, tool_use_id FROM subagents WHERE id = ?",
    )
    .get(agentId);
}

/** Time of the subagent's first message, or null when it has none. */
function startOf(db: Database, sessionId: string, agentId: string): number | null {
  return (
    db
      .query<{ ts: number | null }, [string, string]>(
        // The log's first row rather than MIN(ts): it seeks along messages_order instead of reading
        // every message of the session
        `SELECT ts FROM messages WHERE session_id = ? AND agent_id = ? AND is_copy = 0
         ORDER BY file_id, seq LIMIT 1`,
      )
      .get(sessionId, agentId)?.ts ?? null
  );
}

/**
 * When the main conversation got the result of the call that started the subagent, or null while
 * it waits. Looks from just before the subagent's first message, which follows the call.
 */
function resultAt(
  db: Database,
  sessionId: string,
  toolUseId: string,
  since: number,
): number | null {
  return (
    db
      .query<{ ts: number }, [string, number, string]>(
        `SELECT ts FROM messages
         WHERE session_id = ? AND ts >= ? AND agent_id IS NULL AND is_copy = 0
           AND kind = 'tool_result' AND tool_use_id = ? LIMIT 1`,
      )
      .get(sessionId, since - MINUTE, toolUseId)?.ts ?? null
  );
}

/**
 * Whether the subagent runs on its own. A call the turn waits on returns once the subagent stops
 * (done, or cut off by Esc), after its last message; a background launch is acknowledged at once
 * and the subagent writes on after it. One started without a call (by a workflow) is on its own
 * too. Until its meta file is read, it is taken to follow the turn.
 */
function isBackground(
  db: Database,
  sessionId: string,
  meta: MetaRow | null,
  agent: { startedAt: number; lastAt: number },
): boolean {
  if (!meta) return false;
  if (!meta.tool_use_id) return true;
  const at = resultAt(db, sessionId, meta.tool_use_id, agent.startedAt);
  return at !== null && at < agent.lastAt;
}

/** Tokens the subagent has used since it started. */
function tokensOf(db: Database, sessionId: string, agentId: string, since: number): number {
  return (
    db
      .query<{ n: number | null }, [string, number, string]>(
        `SELECT SUM(${tokensSql()}) AS n FROM usage
         WHERE session_id = ? AND ts >= ? AND agent_id = ? AND is_copy = 0`,
      )
      .get(sessionId, since, agentId)?.n ?? 0
  );
}

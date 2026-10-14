// Closing open items the log shows settled: finding the events (issues closed, PRs merged, tasks
// completed) and closing every item whose closable refs they all settle.
import type { Database } from "bun:sqlite";
import { issueClosedNote, prMergedNote, taskCompletedNote } from "../../../shared/closeNotes.ts";
import { completedTask } from "../../tasks.ts";
import { callOf, type ToolCall } from "../../toolCalls.ts";
import { closedIssues } from "../facts.ts";
import { projectOf, successors } from "./chain.ts";
import { CLOSED_BY } from "./closers.ts";
import { ITEM_SELECT, type ItemRow, itemOf, type LedgerItem } from "./items.ts";
import { isClosable, isTaskRef, TASK_REF_PREFIX } from "./refs.ts";
import { type CloseEvent, settlementOf } from "./settlement.ts";

/** Which sessions to look in: a project's, or a list (a session chain). */
type Scope = { project: number } | { sessions: string[] };

/** The scope as an `IN` operand and its one parameter, so no list is bound value by value. */
function scopeSql(scope: Scope): [string, string | number] {
  return "project" in scope
    ? ["(SELECT id FROM sessions WHERE project_id = ?)", scope.project]
    : ["(SELECT value FROM json_each(?))", JSON.stringify(scope.sessions)];
}

/**
 * Closes the open items of the session's project (or, without a project, its session chain)
 * whose every issue, PR and task ref the log shows settled after the item was opened. Jira keys
 * can't be checked in the log, so they don't hold an item open, but an item naming only Jira keys
 * is left to the model. Running it again closes nothing twice, so it runs on every save: the
 * section that settles an item is often summarized before the one that opened it.
 */
export function closeByRefs(db: Database, sessionId: string): void {
  const project = projectOf(db, sessionId);
  const items = openClosableItems(db, sessionId, project);
  if (items.length === 0) return;
  const from = Math.min(...items.map((i) => i.openedAt));
  const scope: Scope = project === null ? { sessions: successors(db, sessionId) } : { project };
  const shared = [...issueEvents(db, scope, from), ...mergeEvents(db, scope, from)];
  const tasksOf = taskEventsBySession(db, from);
  const close = db.query(
    `UPDATE open_items SET closed_at = ?, closed_session_id = ?, closed_start = ?,
       closed_by = '${CLOSED_BY.ref}', closed_note = ?
     WHERE id = ?`,
  );
  for (const item of items) {
    const events = item.refs.some(isTaskRef) ? [...shared, ...tasksOf(item.sessionId)] : shared;
    const settlement = settlementOf(item, events);
    if (!settlement) continue;
    const { last, note } = settlement;
    close.run(last.ts, last.sessionId, sectionAt(db, last.sessionId, last.ts), note, item.id);
  }
}

/** Open items of the project (or of the session alone) with a ref the log could settle. */
function openClosableItems(db: Database, sessionId: string, project: number | null): LedgerItem[] {
  return db
    .query<ItemRow, [number, string]>(
      `${ITEM_SELECT}
       WHERE i.closed_at IS NULL AND (s.project_id = ?1 OR s.id = ?2)`,
    )
    .all(project ?? -1, sessionId)
    .map(itemOf)
    .filter((i) => i.refs.some(isClosable));
}

/** Task completions per session chain, each chain read once and only when an item needs it. */
function taskEventsBySession(db: Database, from: number): (sessionId: string) => CloseEvent[] {
  const bySession = new Map<string, CloseEvent[]>();
  return (id) => {
    let events = bySession.get(id);
    if (!events) {
      events = taskEvents(db, successors(db, id), from);
      bySession.set(id, events);
    }
    return events;
  };
}

/**
 * Start of the section a time falls in: the last one starting at or before it (a merge is recorded
 * up to a few minutes after its section ends), else the first one after it.
 */
function sectionAt(db: Database, sessionId: string, ts: number): number | null {
  return (
    db
      .query<{ start: number }, [string, number]>(
        `SELECT start FROM segments WHERE session_id = ?1
         ORDER BY start <= ?2 DESC, CASE WHEN start <= ?2 THEN -start ELSE start END LIMIT 1`,
      )
      .get(sessionId, ts)?.start ?? null
  );
}

/** Main-conversation tool calls in the scope after `from`, with results, as the facts read them. */
function callsAfter(
  db: Database,
  scope: Scope,
  from: number,
  tool: string,
  like: string,
): (ToolCall & { sessionId: string })[] {
  const [sessions, param] = scopeSql(scope);
  return db
    .query<
      {
        session_id: string;
        ts: number;
        text: string | null;
        meta: string | null;
        result: string | null;
        is_error: number | null;
      },
      [string | number, string, number, string]
    >(
      `SELECT m.session_id, m.ts, m.text, m.meta, r.text AS result, r.is_error
       FROM messages m
       JOIN messages r ON r.session_id = m.session_id AND r.kind = 'tool_result'
         AND r.tool_use_id = m.tool_use_id AND r.agent_id IS NULL
       WHERE m.session_id IN ${sessions} AND m.kind = 'tool_use'
         AND m.agent_id IS NULL AND m.is_copy = 0 AND m.tool_name = ? AND m.ts > ?
         AND m.meta LIKE ?`,
    )
    .all(param, tool, from, like)
    .map((r) => ({ sessionId: r.session_id, ...callOf(r, tool) }));
}

/** Issues closed with `gh issue close` in the scope after `from`. */
function issueEvents(db: Database, scope: Scope, from: number): CloseEvent[] {
  return callsAfter(db, scope, from, "Bash", "%gh issue close%").flatMap((c) =>
    closedIssues(c).map((num) => ({
      ref: `#${num}`,
      ts: c.ts,
      sessionId: c.sessionId,
      note: issueClosedNote(`#${num}`),
    })),
  );
}

/** PRs merged in the scope after `from`. */
function mergeEvents(db: Database, scope: Scope, from: number): CloseEvent[] {
  const [sessions, param] = scopeSql(scope);
  return db
    .query<{ session_id: string; ref: string; ts: number }, [string | number, number]>(
      `SELECT session_id, ref, ts FROM artifacts
       WHERE session_id IN ${sessions} AND kind = 'merge' AND is_copy = 0
         AND ref LIKE '#%' AND ts > ?`,
    )
    .all(param, from)
    .map((r) => ({ ref: r.ref, ts: r.ts, sessionId: r.session_id, note: prMergedNote(r.ref) }));
}

/** Tasks completed in a session chain; task IDs only mean something within one. */
function taskEvents(db: Database, chain: string[], from: number): CloseEvent[] {
  return callsAfter(db, { sessions: chain }, from, "TaskUpdate", "%completed%").flatMap((c) => {
    const id = completedTask(c);
    return id
      ? [
          {
            ref: `${TASK_REF_PREFIX}${id}`,
            ts: c.ts,
            sessionId: c.sessionId,
            note: taskCompletedNote(id),
          },
        ]
      : [];
  });
}

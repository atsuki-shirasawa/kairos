// The open-items ledger: what a section summary left open, carried into later sections and
// sessions until the log or a later summary shows it settled. State kept in rows rather than
// re-summarized text, so it doesn't drift as summaries build on summaries.
import type { Database } from "bun:sqlite";
import type { OpenItem, OpenKind } from "../../shared/summaryBody.ts";
import { closedIssues, completedTask, type FactCall, type TaskState } from "./facts.ts";
import type { EarlierOpen } from "./prompt.ts";
import type { SectionRef } from "./store.ts";

/** Most earlier items shown to the model; past it, the newest are kept. */
const MAX_CANDIDATES = 15;
/** Cap on a model's note on how an item was closed. */
const NOTE_CHARS = 300;

/** An item in the ledger, as the summarizer reads it. */
export interface LedgerItem {
  id: number;
  sessionId: string;
  start: number;
  /** End of the section that opened it; only what happens after it can close the item. */
  openedAt: number;
  kind: OpenKind | null;
  text: string;
  refs: string[];
  /** Headline of the section that opened it, when it has one. */
  headline: string | null;
}

/** An earlier item the model said the section settled, by its label, with the evidence it gave. */
export interface Closure {
  label: string;
  note: string;
}

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
 * Words shaped like Jira keys that aren't (encodings, standards, hashes). A false key only makes
 * an item a candidate for one more section, so the list need not be complete.
 */
const NOT_JIRA = new Set(["UTF", "ISO", "SHA", "RFC", "MD", "ES", "TLS", "HTTP", "CVE", "GPT"]);

const TASK_REF_RE = /(?:\btask|タスク)\s*#?(\d+)\b/gi;
const NUMBER_REF_RE = /(?<![\w&#/])#(\d+)\b/g;
const URL_REF_RE = /\/(?:pull|issues)\/(\d+)\b/g;
const JIRA_REF_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;

/**
 * The issue / PR numbers ("#12"), Jira keys ("APP-31") and task IDs ("task:3") a text names. On
 * GitHub, issues and PRs share one number space per repository, so both are "#N". A task named
 * as "task #3" is only a task, not issue #3 too.
 */
export function refsOf(text: string): string[] {
  const refs = new Set<string>();
  for (const [, id] of text.matchAll(TASK_REF_RE)) refs.add(`task:${id}`);
  const rest = text.replace(TASK_REF_RE, " ");
  for (const [, num] of rest.matchAll(NUMBER_REF_RE)) refs.add(`#${num}`);
  for (const [, num] of rest.matchAll(URL_REF_RE)) refs.add(`#${num}`);
  for (const [key, project] of rest.matchAll(JIRA_REF_RE))
    if (!NOT_JIRA.has(project ?? "")) refs.add(key);
  return [...refs];
}

/** An item's refs plus the tasks whose subject it quotes, since items often name a task by subject. */
function itemRefs(text: string, tasks: TaskState[]): string[] {
  const lower = text.toLowerCase();
  const bySubject = tasks
    .filter((t) => t.subject.length >= 8 && lower.includes(t.subject.toLowerCase()))
    .map((t) => `task:${t.id}`);
  return [...new Set([...refsOf(text), ...bySubject])];
}

/** The session and the sessions it continues, recursively (`continued_in` points forward). */
function predecessors(db: Database, sessionId: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `WITH RECURSIVE chain(id) AS (
         SELECT ? UNION SELECT s.id FROM sessions s JOIN chain c ON s.continued_in = c.id
       ) SELECT id FROM chain`,
    )
    .all(sessionId)
    .map((r) => r.id);
}

/** The session and the sessions continuing it, recursively. */
function successors(db: Database, sessionId: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `WITH RECURSIVE chain(id) AS (
         SELECT ? UNION SELECT s.continued_in FROM sessions s JOIN chain c ON s.id = c.id
         WHERE s.continued_in IS NOT NULL
       ) SELECT id FROM chain`,
    )
    .all(sessionId)
    .map((r) => r.id);
}

function projectOf(db: Database, sessionId: string): number | null {
  return (
    db
      .query<{ project_id: number | null }, [string]>(
        "SELECT project_id FROM sessions WHERE id = ?",
      )
      .get(sessionId)?.project_id ?? null
  );
}

type ItemRow = {
  id: number;
  session_id: string;
  start: number;
  opened_at: number;
  kind: string | null;
  text: string;
  refs: string;
  headline: string | null;
};

function itemOf(r: ItemRow): LedgerItem {
  let refs: string[] = [];
  try {
    const v: unknown = JSON.parse(r.refs);
    if (Array.isArray(v)) refs = v.filter((x): x is string => typeof x === "string");
  } catch {}
  return {
    id: r.id,
    sessionId: r.session_id,
    start: r.start,
    openedAt: r.opened_at,
    kind: r.kind as OpenKind | null,
    text: r.text,
    refs,
    headline: r.headline,
  };
}

/**
 * Open items of the section's project and of the sessions given (its chain), opened before the
 * section started. Items this section opened, or that a model said it closed, count as not yet
 * there: regenerating the section rewrites both.
 */
function openBefore(db: Database, target: SectionRef, chain: string[]): LedgerItem[] {
  return db
    .query<ItemRow, [number, string, number, string]>(
      `SELECT i.id, i.session_id, i.start, i.opened_at, i.kind, i.text, i.refs, sm.headline
       FROM open_items i
       JOIN sessions s ON s.id = i.session_id
       LEFT JOIN summaries sm ON sm.session_id = i.session_id AND sm.start = i.start
       WHERE i.opened_at <= ?3
         AND NOT (i.session_id = ?2 AND i.start = ?3)
         AND (i.closed_at IS NULL
              OR (i.closed_by = 'model' AND i.closed_session_id = ?2 AND i.closed_start = ?3))
         AND (s.project_id = ?1 OR s.id IN (SELECT value FROM json_each(?4)))
       ORDER BY i.start DESC, i.id`,
    )
    .all(
      projectOf(db, target.sessionId) ?? -1,
      target.sessionId,
      target.start,
      JSON.stringify(chain),
    )
    .map(itemOf);
}

/**
 * Earlier open items a section may have settled: those of its own session and the sessions it
 * continues, and the project's that name an issue, PR or Jira key the section names too (task IDs
 * only mean something within one chain). Newest first, at most `MAX_CANDIDATES`.
 */
export function loadCandidates(
  db: Database,
  target: SectionRef,
  sectionRefs: string[],
): LedgerItem[] {
  const chain = predecessors(db, target.sessionId);
  const inChain = new Set(chain);
  const named = new Set(sectionRefs.filter((r) => !r.startsWith("task:")));
  return openBefore(db, target, chain)
    .filter((i) => inChain.has(i.sessionId) || i.refs.some((r) => named.has(r)))
    .slice(0, MAX_CANDIDATES);
}

/** Candidates as the prompt shows them, labeled O1, O2, … */
export function labelCandidates(items: LedgerItem[], sessionId: string): EarlierOpen[] {
  return items.map((i, n) => ({
    label: `O${n + 1}`,
    kind: i.kind,
    text: i.text,
    from:
      i.sessionId === sessionId
        ? "earlier in this session"
        : i.headline
          ? `an earlier session ("${i.headline}")`
          : "an earlier session",
  }));
}

/**
 * A top-level "Closed" item, written in English in either summary language. The model sometimes
 * adds words before the colon ("Closed items:", "Closed (from open_items):"); left in the body, the
 * line would cost the summary its structured view.
 */
const CLOSED_LINE = /^[-*+]\s+\**closed\b[^:：\n]*[:：]\**\s*(.*)$/i;
/** A label as the model writes it: "O2" or "[O2]". */
const LABEL = /\[?\b(O\d+)\b\]?/g;

/**
 * The closures one line names. A line may name several ("O1, O3", "O1 and O3",
 * "[O1] merged #40; [O2] issue closed"); each label's note is the text up to the next label.
 */
function closuresIn(line: string): Closure[] {
  const found = [...line.matchAll(LABEL)];
  return found.map((m, n) => {
    const end = (m.index ?? 0) + m[0].length;
    const note = line
      .slice(end, found[n + 1]?.index ?? line.length)
      .replace(/^[\s:：\-–—]+/, "")
      .replace(/(?:[\s,;、]|\band\b|と)+$/i, "")
      .trim();
    return { label: m[1] ?? "", note: note.slice(0, NOTE_CHARS) };
  });
}

/**
 * Splits the "Closed:" item off a summary body: the earlier items the model said this section
 * settled. The item isn't part of the body's format, so it is never saved with the summary.
 */
export function takeClosures(body: string): { body: string; closures: Closure[] } {
  const kept: string[] = [];
  const lines: string[] = [];
  let inside = false;
  for (const line of body.split("\n")) {
    const head = CLOSED_LINE.exec(line);
    if (head) {
      inside = true;
      lines.push(head[1] ?? "");
    } else if (inside && (line.trim() === "" || /^\s/.test(line))) {
      lines.push(line.trim().replace(/^[-*+]\s+/, ""));
    } else {
      inside = false;
      kept.push(line);
    }
  }
  return { body: kept.join("\n").trim(), closures: lines.flatMap(closuresIn) };
}

/**
 * How an item was closed after the section that opened it: by a later section's summary or by
 * hand. Kept across a rewrite of the opening section.
 */
type LaterClosure = {
  closed_at: number;
  closed_session_id: string | null;
  closed_start: number | null;
  closed_by: string;
  closed_note: string | null;
};

/** Text compared loosely, so a regenerated item with the same wording finds its closure again. */
const sameText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Closures of the items this section opened, by item text, other than the log's (rechecked after
 * every save anyway) and this section's own: a later section's summary or a hand edit. The rows
 * are replaced when the section is regenerated; an item worded the same keeps its closure.
 */
function laterClosures(db: Database, target: SectionRef): Map<string, LaterClosure> {
  const rows = db
    .query<LaterClosure & { text: string }, [string, number]>(
      `SELECT text, closed_at, closed_session_id, closed_start, closed_by, closed_note
       FROM open_items
       WHERE session_id = ?1 AND start = ?2 AND closed_by IN ('model', 'user', 'dismissed')
         AND NOT (closed_by = 'model' AND closed_session_id = ?1 AND closed_start = ?2)`,
    )
    .all(target.sessionId, target.start);
  return new Map(rows.map((r) => [sameText(r.text), r]));
}

/**
 * Applies a summarized section to the ledger: replaces what an earlier summary of it opened and
 * reopens what that summary closed, records its open items and closures, then closes whatever the
 * log shows settled. Run in the same transaction as saving the summary.
 */
export function recordSection(db: Database, target: SectionRef, update: LedgerUpdate): void {
  db.query(
    `UPDATE open_items SET closed_at = NULL, closed_session_id = NULL, closed_start = NULL,
       closed_by = NULL, closed_note = NULL
     WHERE closed_by = 'model' AND closed_session_id = ? AND closed_start = ?`,
  ).run(target.sessionId, target.start);
  const kept = laterClosures(db, target);
  db.query("DELETE FROM open_items WHERE session_id = ? AND start = ?").run(
    target.sessionId,
    target.start,
  );
  const insert = db.query(
    `INSERT INTO open_items (session_id, start, opened_at, kind, text, refs, closed_at,
       closed_session_id, closed_start, closed_by, closed_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of update.opened) {
    const closure = kept.get(sameText(item.text));
    insert.run(
      target.sessionId,
      target.start,
      update.end,
      item.kind,
      item.text,
      JSON.stringify(itemRefs(item.text, update.tasks)),
      closure?.closed_at ?? null,
      closure?.closed_session_id ?? null,
      closure?.closed_start ?? null,
      closure?.closed_by ?? null,
      closure?.closed_note ?? null,
    );
  }
  const close = db.query(
    `UPDATE open_items SET closed_at = ?, closed_session_id = ?, closed_start = ?,
       closed_by = 'model', closed_note = ?
     WHERE id = ? AND closed_at IS NULL`,
  );
  for (const c of update.closed)
    close.run(update.end, target.sessionId, target.start, c.note || null, c.id);
  closeByRefs(db, target.sessionId);
}

/**
 * Something in the log that settles a ref: an issue closed, a PR merged, a task completed. Its
 * note is a fixed English phrase the UI recognizes and words in its language (`logCloses`), so
 * change both together.
 */
interface CloseEvent {
  ref: string;
  ts: number;
  sessionId: string;
  note: string;
}

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
  const items = db
    .query<ItemRow, [number, string]>(
      `SELECT i.id, i.session_id, i.start, i.opened_at, i.kind, i.text, i.refs, NULL AS headline
       FROM open_items i JOIN sessions s ON s.id = i.session_id
       WHERE i.closed_at IS NULL AND (s.project_id = ?1 OR s.id = ?2)`,
    )
    .all(project ?? -1, sessionId)
    .map(itemOf)
    .filter((i) => i.refs.some(isClosable));
  if (items.length === 0) return;
  const from = Math.min(...items.map((i) => i.openedAt));
  const scope: Scope = project === null ? { sessions: successors(db, sessionId) } : { project };
  const shared = [...issueEvents(db, scope, from), ...mergeEvents(db, scope, from)];
  const tasksBySession = new Map<string, CloseEvent[]>();
  const tasksOf = (id: string) => {
    let events = tasksBySession.get(id);
    if (!events) {
      events = taskEvents(db, successors(db, id), from);
      tasksBySession.set(id, events);
    }
    return events;
  };
  for (const item of items) {
    const events = item.refs.some((r) => r.startsWith("task:"))
      ? [...shared, ...tasksOf(item.sessionId)]
      : shared;
    const settled = item.refs
      .filter(isClosable)
      .map((ref) =>
        events
          .filter((e) => e.ref === ref && e.ts > item.openedAt)
          .reduce<CloseEvent | null>((first, e) => (first && first.ts <= e.ts ? first : e), null),
      );
    if (settled.some((e) => e === null)) continue;
    const last = (settled as CloseEvent[]).reduce((a, b) => (b.ts > a.ts ? b : a));
    db.query(
      `UPDATE open_items SET closed_at = ?, closed_session_id = ?, closed_start = ?,
         closed_by = 'ref', closed_note = ?
       WHERE id = ?`,
    ).run(
      last.ts,
      last.sessionId,
      sectionAt(db, last.sessionId, last.ts),
      (settled as CloseEvent[]).map((e) => e.note).join("; "),
      item.id,
    );
  }
}

/** Refs the log can show settled: issue / PR numbers and task IDs. */
const isClosable = (ref: string) => ref.startsWith("#") || ref.startsWith("task:");

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
): (FactCall & { sessionId: string })[] {
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
    .map((r) => ({
      sessionId: r.session_id,
      ts: r.ts,
      toolName: tool,
      text: r.text ?? "",
      input: r.meta,
      result: r.result,
      isError: r.is_error === 1,
    }));
}

function issueEvents(db: Database, scope: Scope, from: number): CloseEvent[] {
  return callsAfter(db, scope, from, "Bash", "%gh issue close%").flatMap((c) =>
    closedIssues(c).map((num) => ({
      ref: `#${num}`,
      ts: c.ts,
      sessionId: c.sessionId,
      note: `closed #${num}`,
    })),
  );
}

function mergeEvents(db: Database, scope: Scope, from: number): CloseEvent[] {
  const [sessions, param] = scopeSql(scope);
  return db
    .query<{ session_id: string; ref: string; ts: number }, [string | number, number]>(
      `SELECT session_id, ref, ts FROM artifacts
       WHERE session_id IN ${sessions} AND kind = 'merge' AND is_copy = 0
         AND ref LIKE '#%' AND ts > ?`,
    )
    .all(param, from)
    .map((r) => ({ ref: r.ref, ts: r.ts, sessionId: r.session_id, note: `merged PR ${r.ref}` }));
}

/** Tasks completed in a session chain; task IDs only mean something within one. */
function taskEvents(db: Database, chain: string[], from: number): CloseEvent[] {
  return callsAfter(db, { sessions: chain }, from, "TaskUpdate", "%completed%").flatMap((c) => {
    const id = completedTask(c);
    return id
      ? [{ ref: `task:${id}`, ts: c.ts, sessionId: c.sessionId, note: `task #${id} completed` }]
      : [];
  });
}

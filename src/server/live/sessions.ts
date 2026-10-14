// Joins the running sessions from Claude Code's registry with what Kairos has ingested of them:
// the project and title, the tool call in flight, the task list, the last test run and the cost.
import type { Database } from "bun:sqlite";
import type { LiveSession, LiveState, LiveTasks, LiveTest } from "../../shared/api.ts";
import { knownTitle } from "../queries/titles.ts";
import { taskStates } from "../tasks.ts";
import { lastTestRun } from "../testRuns.ts";
import { oneLine } from "../text.ts";
import { loadTaskCalls, loadToolCalls, type ToolCall } from "../toolCalls.ts";
import type { SessionVisibility } from "../visibility.ts";
import type { RegistryEntry } from "./registry.ts";
import { latestResponse, liveUsage } from "./usage.ts";

/** Registry kinds of sessions a person runs; anything else (SDK runs) counts as headless. */
const PERSONAL_KINDS = new Set(["interactive", "bg"]);
/** Tools that stop the turn until the person answers in the terminal. */
const ASKING_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);
/**
 * Records that start a new turn from the person: a call left without a result before one of these
 * was interrupted (Esc writes no result), not still in flight.
 */
const TURN_STARTS = new Set(["prompt", "command", "interrupt", "sdk_prompt", "scheduled"]);
/** How far back from the end of the main conversation to look for a call still in flight. */
const TAIL_MESSAGES = 30;
const TEXT_CHARS = 160;
const COMMAND_CHARS = 80;
const RECAP_CHARS = 600;

interface SessionRow {
  project_id: number | null;
  project_hidden: number | null;
  label: string | null;
  branch: string | null;
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
  away_summary: string | null;
  prompt_count: number;
  sdk_prompt_count: number;
}

interface TailRow {
  kind: string;
  tool_name: string | null;
  tool_use_id: string | null;
  text: string | null;
  meta: string | null;
  ts: number | null;
}

/** A tool call made in the main conversation that has no result yet. */
interface PendingCall {
  name: string;
  text: string;
  input: string | null;
  since: number;
}

/**
 * The newest main-conversation tool call still waiting for its result, unless a new turn started
 * after it. Reads only the conversation's tail.
 */
function pendingCall(db: Database, sessionId: string): PendingCall | null {
  const rows = db
    .query<TailRow, [string, number]>(
      `SELECT kind, tool_name, tool_use_id, text, meta, ts FROM messages
       WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0
       ORDER BY file_id DESC, seq DESC LIMIT ?`,
    )
    .all(sessionId, TAIL_MESSAGES);
  const answered = new Set<string>();
  for (const r of rows) {
    if (TURN_STARTS.has(r.kind)) return null;
    if (r.kind === "tool_result" && r.tool_use_id) answered.add(r.tool_use_id);
    if (r.kind === "tool_use" && r.tool_use_id && !answered.has(r.tool_use_id))
      return {
        name: r.tool_name ?? "",
        text: oneLine(r.text ?? "", TEXT_CHARS),
        input: r.meta,
        since: r.ts ?? 0,
      };
  }
  return null;
}

/** The first question of an AskUserQuestion call, or the plan's first line for ExitPlanMode. */
function questionOf(call: PendingCall): string {
  try {
    const input = JSON.parse(call.input ?? "") as { questions?: { question?: unknown }[] };
    const q = input.questions?.[0]?.question;
    if (typeof q === "string" && q) return oneLine(q, TEXT_CHARS);
  } catch {
    // Input cut short when stored; fall back to the stored summary
  }
  return call.text;
}

/** Start of the session's latest work block. */
function latestSection(db: Database, sessionId: string): number | null {
  return (
    db
      .query<{ start: number }, [string]>(
        "SELECT start FROM segments WHERE session_id = ? ORDER BY start DESC LIMIT 1",
      )
      .get(sessionId)?.start ?? null
  );
}

/** The task list's progress, replayed over the whole session (tasks outlive work blocks). */
function tasksOf(db: Database, sessionId: string, now: number): LiveTasks | null {
  const tasks = taskStates(loadTaskCalls(db, sessionId, now), 0);
  if (tasks.length === 0) return null;
  return {
    done: tasks.filter((t) => t.status === "completed").length,
    total: tasks.length,
    current: tasks.find((t) => t.status === "in_progress")?.subject ?? null,
  };
}

/** The last test or check run among the current work block's calls. */
function testOf(calls: ToolCall[]): LiveTest | null {
  const run = lastTestRun(calls);
  if (!run) return null;
  return {
    command: oneLine(run.command, COMMAND_CHARS),
    passed: run.outcome === "ended" ? null : run.outcome === "passed",
    at: run.call.ts,
  };
}

/** The live state: an unanswered question wins over the registry's busy / idle. */
function stateOf(entry: RegistryEntry, pending: PendingCall | null): LiveState {
  if (pending && ASKING_TOOLS.has(pending.name)) return "asking";
  return entry.status === "idle" ? "waiting" : "working";
}

/**
 * Running sessions to show, in the registry's order (the UI orders them by state). A session
 * whose log Kairos hasn't ingested yet is still listed, with what the registry knows.
 */
export function liveSessions(
  db: Database,
  entries: readonly RegistryEntry[],
  visibility: SessionVisibility,
  now: number,
): LiveSession[] {
  const sessionQuery = db.query<SessionRow, [string]>(
    `SELECT s.project_id, p.hidden AS project_hidden, s.label, s.branch, s.custom_title,
            s.agent_name, s.ai_title, s.first_prompt, s.away_summary, s.prompt_count,
            s.sdk_prompt_count
     FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
  );
  const list: LiveSession[] = [];
  for (const e of entries) {
    if (visibility.hiddenCwds.includes(e.cwd)) continue;
    const s = sessionQuery.get(e.sessionId);
    const headless =
      !PERSONAL_KINDS.has(e.kind) || (s !== null && s.prompt_count === 0 && s.sdk_prompt_count > 0);
    if (headless && !visibility.headless) continue;
    if (s?.project_hidden === 1) continue;
    const pending = s ? pendingCall(db, e.sessionId) : null;
    const state = stateOf(e, pending);
    const section = s ? latestSection(db, e.sessionId) : null;
    const latest = s ? latestResponse(db, e.sessionId) : null;
    list.push({
      id: e.sessionId,
      pid: e.pid,
      name: e.name,
      background: e.kind === "bg",
      cwd: e.cwd,
      projectId: s?.project_id ?? null,
      label: s?.label ?? null,
      branch: s?.branch && s.branch !== "HEAD" ? s.branch : null,
      // No placeholder: the card falls back to the session's name, which says more. A /rename
      // before the first prompt counts too
      title: s ? knownTitle(s) : null,
      state,
      since: e.statusUpdatedAt,
      startedAt: e.startedAt,
      section,
      tool:
        state === "working" && pending
          ? { name: pending.name, text: pending.text, since: pending.since }
          : null,
      question: state === "asking" && pending ? questionOf(pending) : null,
      contextTokens: latest?.context || null,
      usage: latest ? liveUsage(db, e.sessionId, latest, section, now) : null,
      tasks: s ? tasksOf(db, e.sessionId, now) : null,
      test: s && section !== null ? testOf(loadToolCalls(db, e.sessionId, section, now)) : null,
      recap: s?.away_summary ? oneLine(s.away_summary, RECAP_CHARS) : null,
    });
  }
  return list;
}

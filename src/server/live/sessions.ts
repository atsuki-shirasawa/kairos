// Joins the running sessions from Claude Code's registry with what Kairos has ingested of them:
// the project and title, the tool call in flight, the task list, the last test run, the cost and
// the subagents at work, with the one the turn waits on and how far a batch of them has got.
import type { Database } from "bun:sqlite";
import type {
  LiveAgent,
  LiveSession,
  LiveState,
  LiveTasks,
  LiveTest,
  LiveTool,
} from "../../shared/api.ts";
import { ASK_USER_TOOL } from "../askUser.ts";
import { knownTitle } from "../queries/titles.ts";
import { automationSql, type RunKind } from "../runKinds.ts";
import { taskStates } from "../tasks.ts";
import { lastTestRun } from "../testRuns.ts";
import { oneLine } from "../text.ts";
import { loadTaskCalls, loadToolCalls, type ToolCall } from "../toolCalls.ts";
import { isRunShown, type SessionVisibility } from "../visibility.ts";
import { liveAgents } from "./agents.ts";
import { fanOutOf } from "./fanOut.ts";
import type { RegistryEntry } from "./registry.ts";
import { logTail, toolOf } from "./tail.ts";
import { latestResponse, liveUsage } from "./usage.ts";

/** Registry kinds of sessions a person runs; anything else (SDK runs) counts as headless. */
const PERSONAL_KINDS = new Set(["interactive", "bg"]);
/** Tools that stop the turn until the person answers in the terminal. */
const ASKING_TOOLS = new Set([ASK_USER_TOOL, "ExitPlanMode"]);
/**
 * Records that start a new turn from the person: a call left without a result before one of these
 * was interrupted (Esc writes no result), not still in flight.
 */
const TURN_STARTS = new Set(["prompt", "command", "interrupt", "sdk_prompt", "scheduled"]);
/** How far back from the end of the main conversation to look for a call still in flight. */
const TAIL_MESSAGES = 30;
/** How long a question may run on a card. */
const QUESTION_CHARS = 160;
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
  run_kind: RunKind | null;
}

/** A tool call made in the main conversation that has no result yet, with its stored input. */
interface PendingCall extends LiveTool {
  id: string;
  input: string | null;
}

/**
 * The main-conversation tool calls still waiting for their results, newest first. One before the
 * latest turn start was cut off (Esc writes no result), not waiting. Reads only the conversation's
 * tail.
 */
function pendingCalls(db: Database, sessionId: string): PendingCall[] {
  const rows = logTail(db, sessionId, null, TAIL_MESSAGES);
  const answered = new Set<string>();
  const pending: PendingCall[] = [];
  for (const r of rows) {
    if (TURN_STARTS.has(r.kind)) break;
    if (r.kind === "tool_result" && r.tool_use_id) answered.add(r.tool_use_id);
    if (r.kind === "tool_use" && r.tool_use_id && !answered.has(r.tool_use_id))
      pending.push({ ...toolOf(r), id: r.tool_use_id, input: r.meta });
  }
  return pending;
}

/**
 * The subagent that stands for what the session does, whose call the card shows. First the one
 * running foreground subagent a pending main-conversation call launched: the turn waits on it (a
 * subagent's own helpers don't count, as their calls aren't the main conversation's). Else the one
 * background subagent still running: Claude Code launches subagents in the background by default
 * and keeps the session busy meanwhile, whether or not the main conversation runs calls of its own
 * between them. With several, no single one stands for it; while asking, the question does.
 */
export function delegateOf(
  state: LiveState,
  pending: readonly { id: string }[],
  agents: readonly LiveAgent[],
): string | null {
  if (state === "asking") return null;
  const running = agents.filter((a) => a.running);
  const ids = new Set(pending.map((p) => p.id));
  const waited = running.filter((a) => !a.background && ids.has(a.callId ?? ""));
  const standing = waited.length > 0 ? waited : running.filter((a) => a.background);
  return standing.length === 1 ? (standing[0]?.id ?? null) : null;
}

/** The first question of an AskUserQuestion call, or the plan's first line for ExitPlanMode. */
function questionOf(call: PendingCall): string {
  try {
    const input = JSON.parse(call.input ?? "") as { questions?: { question?: unknown }[] };
    const q = input.questions?.[0]?.question;
    if (typeof q === "string" && q) return oneLine(q, QUESTION_CHARS);
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
 * The run kind of a running session: as stored once its log is ingested, else, for an SDK run
 * not ingested yet, automation when its directory already runs automation and trial otherwise.
 * Null for a person's session.
 */
function liveRunKind(
  automatedDir: (cwd: string) => boolean,
  e: RegistryEntry,
  s: SessionRow | null,
): RunKind | null {
  if (s?.run_kind) return s.run_kind;
  if (PERSONAL_KINDS.has(e.kind)) return null;
  return automatedDir(e.cwd) ? "automation" : "trial";
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
            s.agent_name, s.ai_title, s.first_prompt, s.away_summary, s.run_kind
     FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
  );
  const automatedQuery = db.query<{ x: number }, [string]>(
    `SELECT 1 AS x FROM sessions s WHERE s.launch_cwd = ? AND ${automationSql("s")} LIMIT 1`,
  );
  const automatedDir = (cwd: string) => automatedQuery.get(cwd) !== null;
  const list: LiveSession[] = [];
  for (const e of entries) {
    if (visibility.hiddenCwds.includes(e.cwd)) continue;
    const s = sessionQuery.get(e.sessionId);
    if (!isRunShown(liveRunKind(automatedDir, e, s), visibility.runs)) continue;
    if (s?.project_hidden === 1) continue;
    const pendingList = s ? pendingCalls(db, e.sessionId) : [];
    const pending = pendingList[0] ?? null;
    const state = stateOf(e, pending);
    const section = s ? latestSection(db, e.sessionId) : null;
    const latest = s ? latestResponse(db, e.sessionId) : null;
    const agents = s ? liveAgents(db, e.sessionId, state, now) : [];
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
      agents,
      delegate: delegateOf(state, pendingList, agents),
      fanOut: s ? fanOutOf(db, e.sessionId, agents, section ?? 0) : null,
    });
  }
  return list;
}

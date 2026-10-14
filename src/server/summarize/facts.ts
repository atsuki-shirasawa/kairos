// Facts about a section taken from the log by code: what the summary can state as settled or open
// without trusting the model to spot it in a clipped transcript.
import type { Database } from "bun:sqlite";
import { prShortRef } from "../../shared/artifacts.ts";
import { ARTIFACT_GRACE_MS } from "../../shared/constants.ts";
import { MINUTE } from "../../shared/dates.ts";
import { titleAfter } from "../ingest/prs.ts";

/**
 * How long after a section's end its recap may come. Claude Code writes a recap about 3 minutes
 * (at most about 6) after the last activity; work blocks are split by gaps of 15, so this never
 * reaches the next block.
 */
export const NOTE_GRACE_MS = 10 * MINUTE;
/** Cap on the facts block. It comes before the transcript; past the cap, whole lines are dropped. */
export const FACTS_LIMIT = 8_000;
const MAX_TASKS = 20;
const MAX_QUESTIONS = 8;
const RECAP_CHARS = 600;
const PENDING_CHARS = 1_500;
const CURRENT_CHARS = 800;
const NEXT_CHARS = 600;
const LINE_CHARS = 160;

/**
 * Where a command starts in a Bash call: its start or after `&&` / `;` / `|` / `(` / a newline, past
 * `VAR=value` prefixes and runner wrappers (`uv run --locked`, `npx`, `python -m`, `timeout 60`).
 * A runner's name elsewhere (`grep jest`, a commit message) is not a run.
 */
const COMMAND_START = String.raw`(?:^|[\n;&|(])[ \t]*(?:\w+=\S*[ \t]+)*(?:(?:(?:uv|poetry|pipenv|pdm|hatch) run(?: --?\S+)*|npx|bunx|python3? -m|timeout \S+)[ \t]+)*`;

/** A test or check runner (as seen in real logs) where a command starts. */
export const TEST_RE = new RegExp(
  `${COMMAND_START}(?:bun (?:run )?(?:test|check)|(?:npm|pnpm|yarn)(?: run)? test|pytest|tox|vitest|jest|go test|cargo test|make (?:test|check))\\b`,
);
/**
 * What hides a runner's exit status after it: a pipe (`| tail`), `|| true`, or another command
 * after `;` or on a following line (not a `\` continuation). The call then succeeds whether or not
 * the tests passed.
 */
const MASKED_STATUS_RE = /(?<!\|)\|(?!\|)|\|\|\s*(?:true|:)\b|;\s*\S|(?<!\\)\n\s*\S/;
const ISSUE_CLOSE_RE = /\bgh issue close\s+(?:\S*\/issues\/)?#?(\d+)/g;
const ISSUE_CREATE_RE = /\bgh\s+issue\s+create\b/;
const ISSUE_URL_RE = /\/issues\/(\d+)/;
const TASK_CREATED_RE = /Task #(\S+) created/;
/** `"question"="answer"` pairs in an AskUserQuestion result. */
const ANSWER_RE = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g;

/** A commit, PR or merge made during the section. */
export interface FactArtifact {
  kind: string;
  ref: string;
  title: string | null;
}

/** A main-conversation tool call with its result, as the facts read it. */
export interface FactCall {
  ts: number;
  toolName: string;
  /** One-line summary stored with the call (the Bash command, for example). */
  text: string;
  /** The call's input as stored (JSON, possibly cut short). */
  input: string | null;
  result: string | null;
  isError: boolean;
}

/** Everything the facts block is built from. */
export interface FactsInput {
  artifacts: FactArtifact[];
  /** Calls made during the section. */
  calls: FactCall[];
  /** Task calls in the session up to the section's end, since tasks outlive sections. */
  taskCalls: FactCall[];
  /** Start of the section, for telling which tasks it touched. */
  sectionStart: number;
  interrupts: number;
  recaps: string[];
  compactSummaries: string[];
}

/** A task's state at the end of the section. */
export interface TaskState {
  id: string;
  subject: string;
  status: string;
  /** Whether the section created or updated it. */
  touched: boolean;
}

function parseJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const strOf = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Text on one line, whitespace collapsed, cut to `limit` characters with an ellipsis. */
export function oneLine(text: string, limit = LINE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

/** The last two non-empty lines of a tool's output, where runners print their totals. */
function tailLines(text: string | null): string {
  return oneLine(
    (text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-2)
      .join(" / "),
  );
}

/**
 * Each task's subject and latest status, replaying TaskCreate / TaskUpdate in order. The task ID
 * comes from TaskCreate's result ("Task #3 created…"); updates have used both `taskId` / `status`
 * and `task_id` / `state`.
 */
export function taskStates(calls: FactCall[], sectionStart: number): TaskState[] {
  const tasks = new Map<string, TaskState>();
  for (const c of calls) {
    const input = parseJson(c.input);
    const touched = c.ts >= sectionStart;
    if (c.toolName === "TaskCreate") {
      const id = TASK_CREATED_RE.exec(c.result ?? "")?.[1];
      if (!id || c.isError) continue;
      tasks.set(id, {
        id,
        subject: oneLine(strOf(input?.subject) ?? c.text),
        status: "pending",
        touched,
      });
    } else if (c.toolName === "TaskUpdate" && !c.isError) {
      const id = strOf(input?.taskId) ?? strOf(input?.task_id);
      const task = id ? tasks.get(id) : undefined;
      if (!task) continue;
      task.status = strOf(input?.status) ?? strOf(input?.state) ?? task.status;
      task.subject = oneLine(strOf(input?.subject) ?? task.subject);
      task.touched ||= touched;
    }
  }
  return [...tasks.values()].filter((t) => t.status !== "deleted");
}

/** ID of the task a successful TaskUpdate call marked completed, or null for any other call. */
export function completedTask(c: FactCall): string | null {
  if (c.toolName !== "TaskUpdate" || c.isError) return null;
  const input = parseJson(c.input);
  const status = strOf(input?.status) ?? strOf(input?.state);
  return status === "completed" ? (strOf(input?.taskId) ?? strOf(input?.task_id)) : null;
}

/** Questions Claude asked with AskUserQuestion and the user's answers (or that they declined). */
export function questionsOf(calls: FactCall[]): string[] {
  return calls
    .filter((c) => c.toolName === "AskUserQuestion")
    .flatMap((c) => {
      if (c.isError) return [`- ${oneLine(firstQuestion(c) ?? "(question)")} → declined`];
      const pairs = [...(c.result ?? "").matchAll(ANSWER_RE)];
      if (pairs.length === 0) return [`- ${oneLine(firstQuestion(c) ?? "(question)")}`];
      return pairs.map(([, q = "", a = ""]) => `- ${oneLine(q)} → ${oneLine(a)}`);
    });
}

function firstQuestion(c: FactCall): string | null {
  const qs = parseJson(c.input)?.questions;
  const q = Array.isArray(qs) ? (qs[0] as Record<string, unknown> | undefined) : undefined;
  return strOf(q?.question);
}

/** The Bash command of a call: the full one from its input when it parses, else the summary. */
function commandOf(c: FactCall): string {
  return strOf(parseJson(c.input)?.command) ?? c.text;
}

/** Numbers of the issues a successful Bash call closed with `gh issue close`. */
export function closedIssues(c: FactCall): string[] {
  if (c.toolName !== "Bash" || c.isError) return [];
  return [...commandOf(c).matchAll(ISSUE_CLOSE_RE)].map(([, num]) => num ?? "").filter(Boolean);
}

/** Issues closed and filed with `gh issue` during the section. */
export function issueOps(calls: FactCall[]): string[] {
  const lines: string[] = [];
  for (const c of calls) {
    if (c.toolName !== "Bash" || c.isError) continue;
    const cmd = commandOf(c);
    for (const num of closedIssues(c)) lines.push(`- closed #${num}`);
    if (ISSUE_CREATE_RE.test(cmd)) {
      const title = titleAfter(cmd, ISSUE_CREATE_RE);
      const num = ISSUE_URL_RE.exec(c.result ?? "")?.[1];
      lines.push(`- filed ${num ? `#${num}` : "an issue"}${title ? ` "${oneLine(title)}"` : ""}`);
    }
  }
  return lines;
}

/**
 * How a run ended: failed, passed, or unknown when something after the runner hides its exit
 * status. Only a failure is certain then, since a masked run can't fail the call.
 */
function outcomeOf(c: FactCall): "FAILED" | "passed" | "ended" {
  if (c.isError) return "FAILED";
  const cmd = commandOf(c);
  const m = TEST_RE.exec(cmd);
  const rest = m ? cmd.slice(m.index + m[0].length) : "";
  return MASKED_STATUS_RE.test(rest) ? "ended" : "passed";
}

/** A Bash call that ran tests in the foreground (a background start returns before they finish). */
function isTestRun(c: FactCall): boolean {
  if (c.toolName !== "Bash" || !TEST_RE.test(commandOf(c))) return false;
  return parseJson(c.input)?.run_in_background !== true;
}

/**
 * The part of a command that runs the tests: from the start of the runner's line (and of any line
 * it continues with `\`) to the end, so what follows it, such as a pipe that hides its status,
 * stays in view. A multi-line command (a heredoc that edits files, then `bun run check`) would
 * otherwise be shown by its first lines, which aren't the test run; "…" marks the lines left out.
 * A command whose runner is on its first line is kept whole, `cd web && bun test` and all.
 */
export function runnerCommand(cmd: string): string {
  const m = TEST_RE.exec(cmd);
  if (!m) return cmd;
  // The match may begin with the newline that ends the previous line
  const at = m.index + (m[0].startsWith("\n") ? 1 : 0);
  let start = cmd.lastIndexOf("\n", at - 1) + 1;
  while (start > 1 && cmd[start - 2] === "\\") start = cmd.lastIndexOf("\n", start - 2) + 1;
  const part = cmd.slice(start).trim();
  return start > 0 ? `… ${part}` : part;
}

/** The last foreground test or check run among `calls`, with the part that ran it and its outcome. */
export function lastTestRun(
  calls: FactCall[],
): { call: FactCall; command: string; outcome: "FAILED" | "passed" | "ended" } | null {
  const last = calls.findLast(isTestRun);
  return last
    ? { call: last, command: runnerCommand(commandOf(last)), outcome: outcomeOf(last) }
    : null;
}

/** The last test or check run in the section, and how many earlier runs failed. */
export function testSummary(calls: FactCall[]): string | null {
  const runs = calls.filter(isTestRun);
  const run = lastTestRun(runs);
  if (!run) return null;
  const failedBefore = runs.slice(0, -1).filter((r) => r.isError).length;
  const cmd = oneLine(run.command, 80);
  const tail = tailLines(run.call.result);
  const outcome = run.outcome;
  const how =
    outcome === "ended" ? "ended (exit status hidden by the command; see its output)" : outcome;
  return [
    `last run \`${cmd}\` ${how}${tail ? ` (${tail})` : ""}`,
    failedBefore ? `; ${failedBefore} earlier run(s) failed` : "",
  ].join("");
}

/**
 * The body of one numbered section of a compact summary ("7. **Pending Tasks:**" up to the next
 * numbered heading), or null when it is missing or empty.
 */
function sectionOf(text: string, name: string, limit: number): string | null {
  const head = new RegExp(`^[ \\t#]*\\d+\\.\\s*\\**${name}\\**:?\\**[ \\t]*`, "m").exec(text);
  if (!head) return null;
  const rest = text.slice(head.index + head[0].length);
  const next = /^[ \t#]*\d+\.\s*\**[A-Z][A-Za-z ]+\**:?\**[ \t]*$/m.exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  if (!body) return null;
  return body.length <= limit ? body : `${body.slice(0, limit)}…`;
}

/**
 * The parts of a compact summary that say where the work stood: pending tasks, current work and
 * the next step. Without those headings, its end.
 */
export function compactPending(text: string): string {
  const parts = [
    ["Pending tasks", sectionOf(text, "Pending Tasks", PENDING_CHARS)],
    ["Current work", sectionOf(text, "Current Work", CURRENT_CHARS)],
    ["Next step", sectionOf(text, "Optional Next Step", NEXT_CHARS)],
  ].filter((p): p is [string, string] => Boolean(p[1]));
  if (parts.length === 0) return `…${text.trim().slice(-PENDING_CHARS)}`;
  return parts.map(([label, body]) => `${label}:\n${body}`).join("\n");
}

function artifactLines(artifacts: FactArtifact[]): string[] {
  return artifacts.map((a) => {
    if (a.kind === "commit") return `- commit ${a.ref.slice(0, 7)} ${a.title ?? ""}`.trimEnd();
    if (a.kind === "merge") return `- merged PR ${a.ref}`;
    // A title from a pr-link record already starts with the number ("#42 me/app")
    if (a.title?.startsWith("#")) return `- opened PR ${a.title}`;
    return `- opened PR ${prShortRef(a.ref)}${a.title ? ` ${a.title}` : ""}`;
  });
}

function taskLines(tasks: TaskState[]): string[] {
  // Tasks the section touched, plus earlier ones still open; finished ones from before add nothing
  const shown = tasks.filter((t) => t.touched || t.status !== "completed");
  return shown.slice(-MAX_TASKS).map((t) => `- [${t.status}] #${t.id} ${t.subject}`);
}

/** Lists joined in order, dropping whole lines once `limit` would be passed. */
function capped(sections: [string, string[]][], limit: number): string {
  const out: string[] = [];
  let length = 0;
  for (const [label, lines] of sections) {
    const kept: string[] = [];
    for (const line of lines) {
      const add = (kept.length ? 0 : label.length + 4) + line.length + 1;
      if (length + add > limit) {
        if (kept.length) out.push(`${label}:\n${kept.join("\n")}`);
        out.push("… (more facts omitted)");
        return out.join("\n\n");
      }
      kept.push(line);
      length += add;
    }
    if (kept.length) out.push(`${label}:\n${kept.join("\n")}`);
  }
  return out.join("\n\n");
}

/** The facts as a block of labeled lists, empty when the log records none. */
export function formatFacts(f: FactsInput): string {
  const sections: [string, string[]][] = [
    ["Commits and PRs", artifactLines(f.artifacts)],
    ["Issues", issueOps(f.calls)],
    ["Tests", [testSummary(f.calls)].filter((t): t is string => t !== null)],
    ["Tasks at the end of this section", taskLines(taskStates(f.taskCalls, f.sectionStart))],
    ["Questions Claude asked, with the answers", questionsOf(f.calls).slice(0, MAX_QUESTIONS)],
    ["Interrupted by the user", f.interrupts ? [`${f.interrupts} time(s)`] : []],
    [
      "Claude Code's recap (where the work stood)",
      f.recaps.map((r) => `- ${oneLine(r, RECAP_CHARS)}`),
    ],
    ["Claude Code's notes when compacting", f.compactSummaries.map(compactPending)],
  ];
  return capped(sections, FACTS_LIMIT);
}

/** Reads the section's facts from the DB: its main conversation's own, non-scheduled records. */
export function loadFacts(db: Database, sessionId: string, start: number, end: number): FactsInput {
  const artifacts = db
    .query<FactArtifact, [string, number, number]>(
      `SELECT kind, ref, title FROM artifacts
       WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ? ORDER BY ts, kind`,
    )
    .all(sessionId, start, end + ARTIFACT_GRACE_MS);
  const calls = loadCalls(db, sessionId, start, end);
  // Copies too: a continued session carries on the tasks the previous one created
  const taskCalls = loadCalls(db, sessionId, 0, end, { tasks: true });
  const notes = (kind: string, to: number) =>
    db
      .query<{ text: string }, [string, string, number, number]>(
        `SELECT text FROM messages
         WHERE session_id = ? AND kind = ? AND agent_id IS NULL AND is_copy = 0 AND is_scheduled = 0
           AND ts BETWEEN ? AND ?
         ORDER BY ts`,
      )
      .all(sessionId, kind, start, to)
      .map((r) => r.text);
  const interrupts =
    db
      .query<{ n: number }, [string, number, number]>(
        `SELECT COUNT(*) AS n FROM messages
         WHERE session_id = ? AND kind = 'interrupt' AND agent_id IS NULL AND is_copy = 0
           AND is_scheduled = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, start, end)?.n ?? 0;
  return {
    artifacts,
    calls,
    taskCalls,
    sectionStart: start,
    interrupts,
    // A recap comes after the section's last activity; a compaction happens inside it
    recaps: notes("away_summary", end + NOTE_GRACE_MS),
    compactSummaries: notes("compact_summary", end),
  };
}

/**
 * The main conversation's own tool calls in [from, to] with their results. With `tasks`, only task
 * calls, copies from the previous session included.
 */
export function loadCalls(
  db: Database,
  sessionId: string,
  from: number,
  to: number,
  opt: { tasks?: boolean } = {},
): FactCall[] {
  const where = opt.tasks ? "AND m.tool_name IN ('TaskCreate', 'TaskUpdate')" : "AND m.is_copy = 0";
  return db
    .query<
      {
        ts: number;
        tool_name: string;
        text: string | null;
        meta: string | null;
        result: string | null;
        is_error: number | null;
      },
      [string, number, number]
    >(
      `SELECT m.ts, m.tool_name, m.text, m.meta, r.text AS result, r.is_error
       FROM messages m
       LEFT JOIN messages r ON r.session_id = m.session_id AND r.kind = 'tool_result'
         AND r.tool_use_id = m.tool_use_id AND r.agent_id IS NULL
       WHERE m.session_id = ? AND m.kind = 'tool_use' AND m.agent_id IS NULL
         AND m.is_scheduled = 0 AND m.ts BETWEEN ? AND ? ${where}
       ORDER BY m.file_id, m.seq`,
    )
    .all(sessionId, from, to)
    .map((r) => ({
      ts: r.ts,
      toolName: r.tool_name,
      text: r.text ?? "",
      input: r.meta,
      result: r.result,
      isError: r.is_error === 1,
    }));
}

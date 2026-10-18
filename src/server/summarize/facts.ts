// Facts about a section taken from the log by code: what the summary can state as settled or open
// without trusting the model to spot it in a clipped transcript.
import type { Database } from "bun:sqlite";
import { prShortRef } from "../../shared/artifacts.ts";
import { MINUTE } from "../../shared/dates.ts";
import { outputsUntilSql } from "../db/blockOutputs.ts";
import { titleAfter } from "../ingest/prs.ts";
import { type TaskState, taskStates } from "../tasks.ts";
import { isTestRun, lastTestRun } from "../testRuns.ts";
import { oneLine } from "../text.ts";
import {
  commandOf,
  loadTaskCalls,
  loadToolCalls,
  stringField,
  type ToolCall,
  toolInput,
} from "../toolCalls.ts";

/**
 * How long after a section's end its recap may come. Claude Code writes a recap about 3 minutes
 * (at most about 6) after the last activity; the window stops where the next block starts.
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

const ISSUE_CLOSE_RE = /\bgh issue close\s+(?:\S*\/issues\/)?#?(\d+)/g;
const ISSUE_CREATE_RE = /\bgh\s+issue\s+create\b/;
const ISSUE_URL_RE = /\/issues\/(\d+)/;
/** `"question"="answer"` pairs in an AskUserQuestion result. */
const ANSWER_RE = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g;

/** A commit, PR or merge made during the section. */
export interface FactArtifact {
  kind: string;
  ref: string;
  title: string | null;
}

/** Everything the facts block is built from. */
export interface FactsInput {
  artifacts: FactArtifact[];
  /** Calls made during the section. */
  calls: ToolCall[];
  /**
   * Tasks in the session at the section's end, replayed from the session's start since tasks
   * outlive sections; `touched` marks the ones the section created or updated.
   */
  tasks: TaskState[];
  interrupts: number;
  recaps: string[];
  compactSummaries: string[];
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

/** Questions Claude asked with AskUserQuestion and the user's answers (or that they declined). */
export function questionsOf(calls: ToolCall[]): string[] {
  return calls
    .filter((c) => c.toolName === "AskUserQuestion")
    .flatMap((c) => {
      if (c.isError) return [`- ${oneLine(firstQuestion(c) ?? "(question)")} → declined`];
      const pairs = [...(c.result ?? "").matchAll(ANSWER_RE)];
      if (pairs.length === 0) return [`- ${oneLine(firstQuestion(c) ?? "(question)")}`];
      return pairs.map(([, q = "", a = ""]) => `- ${oneLine(q)} → ${oneLine(a)}`);
    });
}

/** The first question an AskUserQuestion call asked, for when its answers can't be read. */
function firstQuestion(c: ToolCall): string | null {
  const qs = toolInput(c)?.questions;
  const q = Array.isArray(qs) ? (qs[0] as Record<string, unknown> | undefined) : undefined;
  return stringField(q?.question);
}

/** Numbers of the issues a successful Bash call closed with `gh issue close`. */
export function closedIssues(c: ToolCall): string[] {
  if (c.toolName !== "Bash" || c.isError) return [];
  return [...commandOf(c).matchAll(ISSUE_CLOSE_RE)].map(([, num]) => num ?? "").filter(Boolean);
}

/** Issues closed and filed with `gh issue` during the section. */
export function issueOps(calls: ToolCall[]): string[] {
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

/** The last test or check run in the section, and how many earlier runs failed. */
export function testSummary(calls: ToolCall[]): string | null {
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
    ["Tasks at the end of this section", taskLines(f.tasks)],
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
  const until = outputWindows(db, sessionId, start, end);
  return {
    artifacts: loadArtifacts(db, sessionId, start, until.artifacts),
    calls: loadToolCalls(db, sessionId, start, end),
    tasks: taskStates(loadTaskCalls(db, sessionId, end), start),
    interrupts: countInterrupts(db, sessionId, start, end),
    // A recap comes after the section's last activity; a compaction happens inside it
    recaps: loadNotes(db, sessionId, "away_summary", start, until.recaps),
    compactSummaries: loadNotes(db, sessionId, "compact_summary", start, end),
  };
}

/** The last moments whose artifacts and recaps the section owns (see `outputsUntilSql`). */
interface OutputWindows {
  artifacts: number;
  recaps: number;
}

/** Reads the section's `OutputWindows`; a SELECT without FROM always gives its one row. */
function outputWindows(db: Database, sessionId: string, start: number, end: number): OutputWindows {
  const block = { session: "?1", start: "?2", end: "?3" };
  return db
    .query<OutputWindows, [string, number, number]>(
      `SELECT ${outputsUntilSql(block)} AS artifacts,
              ${outputsUntilSql(block, NOTE_GRACE_MS)} AS recaps`,
    )
    .get(sessionId, start, end) as OutputWindows;
}

/** Commits, PRs and merges of the section, including those recorded up to `until`, just after it. */
function loadArtifacts(
  db: Database,
  sessionId: string,
  start: number,
  until: number,
): FactArtifact[] {
  return db
    .query<FactArtifact, [string, number, number]>(
      `SELECT kind, ref, title FROM artifacts
       WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ? ORDER BY ts, kind`,
    )
    .all(sessionId, start, until);
}

/** Texts of the main conversation's own messages of one kind in [from, to], in time order. */
function loadNotes(
  db: Database,
  sessionId: string,
  kind: string,
  from: number,
  to: number,
): string[] {
  return db
    .query<{ text: string }, [string, string, number, number]>(
      `SELECT text FROM messages
       WHERE session_id = ? AND kind = ? AND agent_id IS NULL AND is_copy = 0 AND is_scheduled = 0
         AND ts BETWEEN ? AND ?
       ORDER BY ts`,
    )
    .all(sessionId, kind, from, to)
    .map((r) => r.text);
}

/** How many times the user interrupted the main conversation during the section. */
function countInterrupts(db: Database, sessionId: string, start: number, end: number): number {
  return (
    db
      .query<{ n: number }, [string, number, number]>(
        `SELECT COUNT(*) AS n FROM messages
         WHERE session_id = ? AND kind = 'interrupt' AND agent_id IS NULL AND is_copy = 0
           AND is_scheduled = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, start, end)?.n ?? 0
  );
}

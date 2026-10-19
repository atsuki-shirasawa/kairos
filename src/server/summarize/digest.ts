// Builds the excerpt of a section that is passed to the LLM.
import { notificationResult, notificationSummary } from "../../shared/notifications.ts";
import { TEST_RE } from "../testRuns.ts";
import { oneLine } from "../text.ts";

/** A stored message, reduced to the columns the digest reads. */
export interface DigestMessage {
  kind: string;
  text: string | null;
  tool_name: string | null;
  /** Links a tool call to its result. */
  tool_use_id?: string | null;
  /** 1 when a tool result is an error. */
  is_error?: number;
}

/**
 * Message kinds that make a section worth summarizing: finding targets checks for these, so a
 * section the digest would come out empty for is never picked. The digest also reads tool results
 * beside their calls, and task notifications, but neither is work on its own: a section holding
 * only a background task's notice has nothing to summarize.
 */
export const DIGEST_KINDS = [
  "prompt",
  "command",
  "sdk_prompt",
  "assistant",
  "tool_use",
  "compact",
] as const;

/** Default cap on the digest length in characters; past it, the middle is dropped. */
export const DIGEST_LIMIT = 60_000;
const PROMPT_CHARS = 2_000;
const REPLY_CHARS = 800;
/** The last reply is where Claude sums up and lists what is left, so it is kept nearly whole. */
const LAST_REPLY_CHARS = 4_000;
const TOOL_CHARS = 160;
const FAILURE_CHARS = 200;
/** A subagent's report opens with what it did and found; the rest is detail. */
const REPORT_CHARS = 600;
/** The head of a tool result a headless run read its assignment from. */
const INPUT_CHARS = 400;
/**
 * Calls whose input says nothing of the work: ScheduleWakeup repeats the run's own request to
 * resume with, which in a loop is the same template on every call.
 */
const QUIET_TOOLS = new Set(["ScheduleWakeup"]);
/** What Claude Code puts before a subagent's report in the Agent call's result. */
const HAND_BACK_RE = /^\[Subagent hand-back\][\s\S]*?The report follows:\s*/;
/** The result of an Agent call launched in the background: the report comes later, as a notification. */
const LAUNCHED_RE = /^Async agent launched/;

/** Calls whose failure says whether the work got done: tests and checks, git and gh. */
const TELLING_CALL_RE = new RegExp(`${TEST_RE.source}|\\b(?:git|gh) `);

function clip(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}

/** The output's last non-empty line, where errors and test totals usually are. */
function failureLine(text: string | null): string {
  const line =
    (text ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? "";
  return clip(line, FAILURE_CHARS);
}

/** Tool results by the ID of the call that made them. */
function resultsByCall(messages: DigestMessage[]): Map<string, DigestMessage> {
  const results = new Map<string, DigestMessage>();
  for (const m of messages)
    if (m.kind === "tool_result" && m.tool_use_id) results.set(m.tool_use_id, m);
  return results;
}

/** A subagent's report from its Agent call's result, or null for a background launch's receipt. */
export function subagentReport(result: string): string | null {
  const text = result.replace(HAND_BACK_RE, "").trim();
  return text && !LAUNCHED_RE.test(text) ? text : null;
}

/** A task notification as one line: what finished, and the head of what it reported. */
export function noticeLine(text: string): string {
  const summary = notificationSummary(text) ?? "Task finished";
  const result = notificationResult(text);
  return result ? `${oneLine(summary)}: ${oneLine(result, REPORT_CHARS)}` : oneLine(summary);
}

/** How a digest is read. */
export interface DigestOptions {
  /** Cap on the length in characters; past it, the middle is dropped. */
  limit?: number;
  /**
   * How many of the first plain tool results to quote (reports, errors and quiet tools don't
   * count). A headless run's request is a script's fixed instruction, and what it was set to do
   * is often only in what it read first (an assignment).
   */
  leadingResults?: number;
}

/** Whether a call's result is one `leadingResults` may quote: plain output, not a report or error. */
function isQuotable(m: DigestMessage, result: DigestMessage | undefined): boolean {
  const name = m.tool_name ?? "tool";
  if (!result || result.is_error === 1 || !result.text?.trim()) return false;
  return name !== "Agent" && !QUIET_TOOLS.has(name);
}

/** The line a call's result adds, if any: a telling failure, a subagent's report, or a quote. */
function resultLine(m: DigestMessage, result: DigestMessage, quote: boolean): string | null {
  const name = m.tool_name ?? "tool";
  const out = result.text ?? "";
  if (result.is_error === 1)
    return name === "Bash" && TELLING_CALL_RE.test(m.text ?? "")
      ? `    ✗ failed: ${failureLine(out)}`
      : null;
  if (name === "Agent") {
    const report = subagentReport(out);
    return report ? `    ← report: ${oneLine(report, REPORT_CHARS)}` : null;
  }
  return quote && isQuotable(m, result) ? `    ← ${oneLine(out, INPUT_CHARS)}` : null;
}

/** The line a call adds; a quiet tool's input is left out. */
function callLine(m: DigestMessage): string {
  const name = m.tool_name ?? "tool";
  return QUIET_TOOLS.has(name) ? `  → ${name}` : `  → ${name}: ${clip(m.text ?? "", TOOL_CHARS)}`;
}

/**
 * Lists only what shows the work: prompts, replies, tool calls, failed tests, git and gh calls,
 * subagents' reports (from their Agent call or their task notification) and, with
 * `leadingResults`, the head of the first tool results. If too long, keeps the start and the end.
 */
export function buildDigest(messages: DigestMessage[], opts: DigestOptions = {}): string {
  const { limit = DIGEST_LIMIT, leadingResults = 0 } = opts;
  const results = resultsByCall(messages);
  const lastReply = messages.findLastIndex((m) => m.kind === "assistant");
  const lines: string[] = [];
  let quoted = 0;
  messages.forEach((m, i) => {
    const text = m.text ?? "";
    // The SDK input is what a headless session was asked to do, so it reads as the user's request
    if (m.kind === "prompt" || m.kind === "command" || m.kind === "sdk_prompt")
      lines.push(`\n[User] ${clip(text, PROMPT_CHARS)}`);
    else if (m.kind === "assistant")
      lines.push(`[Claude] ${clip(text, i === lastReply ? LAST_REPLY_CHARS : REPLY_CHARS)}`);
    else if (m.kind === "tool_use") {
      const result = m.tool_use_id ? results.get(m.tool_use_id) : undefined;
      lines.push(callLine(m));
      const line = result && resultLine(m, result, quoted < leadingResults);
      if (line) lines.push(line);
      if (isQuotable(m, result)) quoted++;
    } else if (m.kind === "notification") lines.push(`[Done] ${noticeLine(text)}`);
    else if (m.kind === "compact") lines.push("— conversation compacted —");
  });
  const all = lines.join("\n").trim();
  if (all.length <= limit) return all;
  // The first request and how things ended matter most
  const head = Math.floor((limit * 2) / 5);
  return `${all.slice(0, head)}\n\n… (omitted) …\n\n${all.slice(all.length - (limit - head))}`;
}

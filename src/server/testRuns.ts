// Test and check runs among Bash calls: which call ran tests, the part of its command that did,
// and how it ended. Shared by the summaries' facts and excerpt, and the live page.
import { commandOf, type ToolCall, toolInput } from "./toolCalls.ts";

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

/** How a run ended: failed, passed, or unknown ("ended") when the command hides its exit status. */
export type TestOutcome = "FAILED" | "passed" | "ended";

/** A test run: the call, the part of its command that ran the tests, and how it ended. */
export interface TestRun {
  call: ToolCall;
  command: string;
  outcome: TestOutcome;
}

/**
 * How a run ended: failed, passed, or unknown when something after the runner hides its exit
 * status. Only a failure is certain then, since a masked run can't fail the call.
 */
function outcomeOf(c: ToolCall): TestOutcome {
  if (c.isError) return "FAILED";
  const cmd = commandOf(c);
  const m = TEST_RE.exec(cmd);
  const rest = m ? cmd.slice(m.index + m[0].length) : "";
  return MASKED_STATUS_RE.test(rest) ? "ended" : "passed";
}

/** A Bash call that ran tests in the foreground (a background start returns before they finish). */
export function isTestRun(c: ToolCall): boolean {
  if (c.toolName !== "Bash" || !TEST_RE.test(commandOf(c))) return false;
  return toolInput(c)?.run_in_background !== true;
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
export function lastTestRun(calls: ToolCall[]): TestRun | null {
  const last = calls.findLast(isTestRun);
  return last
    ? { call: last, command: runnerCommand(commandOf(last)), outcome: outcomeOf(last) }
    : null;
}

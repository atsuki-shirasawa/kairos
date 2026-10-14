import { mkdirSync } from "node:fs";
import { MINUTE } from "../../shared/dates.ts";
import { CLAUDE_NOT_FOUND, timedOutMessage } from "../../shared/summaryFailure.ts";

/** A `claude -p` run failed (no command, timeout, exit code). The message is shown in the UI. */
export class SummaryError extends Error {}

/** Levels `claude --effort` accepts. */
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
/** How hard the model thinks; see `EFFORT_LEVELS`. */
export type Effort = (typeof EFFORT_LEVELS)[number];
/**
 * Effort unless `--summary-effort` is given. A headline and a few bullets from an excerpt need
 * little thought, and low keeps each run quick and light on the plan's usage.
 */
export const DEFAULT_EFFORT: Effort = "low";

/** Whether a string is one of `EFFORT_LEVELS`. */
export function isEffort(value: string): value is Effort {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/** How to run `claude -p`. */
export interface ClaudeOptions {
  /** Model passed to `--model` (an alias such as `haiku` or a full model ID). */
  model: string;
  /** Passed to `--effort` (default: `DEFAULT_EFFORT`). */
  effort?: Effort;
  /** Working directory. A dedicated empty directory, so no project's CLAUDE.md or settings are loaded. */
  cwd: string;
  /** Kills the run after this many ms (default: 3 minutes). */
  timeoutMs?: number;
  /**
   * Environment for `claude` (default: this process's). Pass one without a Claude Code session's
   * variables when this process may itself run inside a session, as `kairos summarize` can.
   */
  env?: Record<string, string | undefined>;
}

/** How long a run may take before it is killed, unless `ClaudeOptions.timeoutMs` says otherwise. */
const DEFAULT_TIMEOUT_MS = 3 * MINUTE;

/**
 * The argv for `claude -p`. The flags keep the run free of side effects: no saved session, no
 * tools, no MCP servers and no user or local settings. The prompt never goes here; it is passed on
 * stdin, so log text can't become an argument.
 */
export function claudeArgs(exe: string, opts: Pick<ClaudeOptions, "model" | "effort">): string[] {
  return [
    exe,
    "-p",
    "--model",
    opts.model,
    "--effort",
    opts.effort ?? DEFAULT_EFFORT,
    "--no-session-persistence",
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "project",
  ];
}

/** What a finished `claude -p` process left behind, for `interpretExit`. */
export interface ClaudeExit {
  /** Everything written to stdout. */
  out: string;
  /** Everything written to stderr. */
  err: string;
  /** The process's exit code. */
  code: number;
  /** Whether the run was killed for taking longer than `timeoutMs`. */
  timedOut: boolean;
  /** The timeout that applied, named in the timeout message. */
  timeoutMs: number;
}

/**
 * Turns a finished run into the answer text, or throws a `SummaryError` carrying the message the
 * UI shows: the timeout, else stderr (or stdout, or the exit code) cut to 500 characters.
 */
export function interpretExit({ out, err, code, timedOut, timeoutMs }: ClaudeExit): string {
  // The exit code of a killed process doesn't say why, so say it timed out
  if (timedOut) throw new SummaryError(timedOutMessage(Math.round(timeoutMs / 1000)));
  if (code !== 0 || !out.trim()) {
    throw new SummaryError((err || out || `exit code ${code}`).trim().slice(0, 500));
  }
  return out.trim();
}

/**
 * Answers a prompt with `claude -p`. It reuses Claude Code's authentication, so no API key is needed.
 * Runs without saving a session and without tools or MCP, so it has no side effects.
 */
export async function runClaude(prompt: string, opts: ClaudeOptions): Promise<string> {
  const exe = Bun.which("claude");
  if (!exe) throw new SummaryError(CLAUDE_NOT_FOUND);
  mkdirSync(opts.cwd, { recursive: true });
  const proc = Bun.spawn(claudeArgs(exe, opts), {
    cwd: opts.cwd,
    ...(opts.env ? { env: opts.env } : {}),
    stdin: new Blob([prompt]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return interpretExit({ out, err, code, timedOut, timeoutMs });
  } finally {
    clearTimeout(timer);
  }
}

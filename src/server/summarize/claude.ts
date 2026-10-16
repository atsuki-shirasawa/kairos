import { mkdirSync } from "node:fs";
import { MINUTE } from "../../shared/dates.ts";
import { CLAUDE_NOT_FOUND, timedOutMessage } from "../../shared/summaryFailure.ts";
import { asRecord } from "../json.ts";

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
  /**
   * A JSON schema the answer must follow. With it the run answers with a JSON envelope (see
   * `readEnvelope`) whose `structured_output` holds the answer, instead of plain text.
   */
  schema?: object;
}

/**
 * Answers a prompt with the LLM, following `schema` when given. Production uses `runClaude`; tests
 * pass a stub. It returns the raw stdout, which `readEnvelope` reads when a schema was given.
 */
export type Runner = (prompt: string, schema?: object) => Promise<string>;

/** How long a run may take before it is killed, unless `ClaudeOptions.timeoutMs` says otherwise. */
const DEFAULT_TIMEOUT_MS = 3 * MINUTE;
/** Cap on an error message kept for the UI: enough for claude's own message, short of a dump. */
const ERROR_CHARS = 500;

/**
 * The argv for `claude -p`. The flags keep the run free of side effects: no saved session, no
 * tools, no MCP servers and no user or local settings. The prompt never goes here; it is passed on
 * stdin, so log text can't become an argument. The schema may: it is a constant of Kairos's own.
 */
export function claudeArgs(
  exe: string,
  opts: Pick<ClaudeOptions, "model" | "effort" | "schema">,
): string[] {
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
    ...(opts.schema
      ? ["--output-format", "json", "--json-schema", JSON.stringify(opts.schema)]
      : []),
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
 * UI shows: the timeout, else the error in a JSON envelope, stderr, stdout or the exit code, cut
 * to `ERROR_CHARS`.
 */
export function interpretExit({ out, err, code, timedOut, timeoutMs }: ClaudeExit): string {
  // The exit code of a killed process doesn't say why, so say it timed out
  if (timedOut) throw new SummaryError(timedOutMessage(Math.round(timeoutMs / 1000)));
  if (code !== 0 || !out.trim()) {
    throw new SummaryError(
      (envelopeError(out) || err || out || `exit code ${code}`).trim().slice(0, ERROR_CHARS),
    );
  }
  return out.trim();
}

/** What one run cost, as the JSON envelope reports it. */
export interface RunStats {
  /** Every input token the model read, cached or not. */
  inputTokens: number;
  outputTokens: number;
  /** What the run would cost at list prices; a usage gauge, like `pricing.ts`. */
  costUsd: number;
  /** How long the run took, as `claude` measured it. */
  latencyMs: number;
}

/** A schema-following run's answer and what it cost. */
export interface ClaudeAnswer {
  /** The answer as the schema shaped it; still to be checked, since it comes from the model. */
  output: unknown;
  stats: RunStats;
}

/** The fields Kairos reads from the envelope `--output-format json` writes. */
interface Envelope {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  total_cost_usd?: unknown;
  duration_ms?: unknown;
  usage?: Record<string, unknown>;
}

/** The envelope in a run's stdout, or null when it isn't one. */
function parseEnvelope(out: string): Envelope | null {
  try {
    return asRecord(JSON.parse(out)) as Envelope | null;
  } catch {
    return null;
  }
}

/** The error text an envelope carries (a login or rate-limit message), so the UI can classify it. */
function envelopeError(out: string): string | null {
  const envelope = parseEnvelope(out);
  return envelope?.is_error && typeof envelope.result === "string" ? envelope.result : null;
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Reads the JSON envelope a schema-following run wrote: its structured answer and its cost.
 * Throws a `SummaryError` when the run reported an error or wrote no envelope.
 */
export function readEnvelope(out: string): ClaudeAnswer {
  const envelope = parseEnvelope(out);
  // Not the output itself: the message goes to the server log, and the output quotes the log
  if (!envelope) throw new SummaryError(`Not a JSON answer (${out.length} characters)`);
  if (envelope.is_error) {
    throw new SummaryError(
      String(envelope.result ?? "claude reported an error").slice(0, ERROR_CHARS),
    );
  }
  const usage = envelope.usage ?? {};
  return {
    output: envelope.structured_output,
    stats: {
      inputTokens:
        count(usage.input_tokens) +
        count(usage.cache_creation_input_tokens) +
        count(usage.cache_read_input_tokens),
      outputTokens: count(usage.output_tokens),
      costUsd: count(envelope.total_cost_usd),
      latencyMs: count(envelope.duration_ms),
    },
  };
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

/**
 * A `Runner` over `runClaude` with these options, passing on the schema a summary asks with. The
 * daemon, `kairos summarize` and the eval all summarize through it.
 */
export function claudeRunner(opts: Omit<ClaudeOptions, "schema">): Runner {
  return (prompt, schema) => runClaude(prompt, schema ? { ...opts, schema } : opts);
}

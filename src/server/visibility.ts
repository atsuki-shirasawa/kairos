// Which sessions the calendar, search and summaries look at. Kept in one place so every read
// query agrees on what a visible session is.
import type { Database } from "bun:sqlite";
import { SUMMARIZER_CWD } from "./paths.ts";
import { automationSql, headlessSql, RUN_KINDS, type RunKind } from "./runKinds.ts";
import { storedShowTrials } from "./settings.ts";

/**
 * Which sessions count: only a person's (`people`), also automation runs (`automation`, what the
 * calendar shows by default), or every headless run, trials too (`all`).
 */
export type ShownRuns = "people" | "automation" | "all";

/** What the calendar shows unless the UI turns trial runs on. */
export const DEFAULT_SHOWN_RUNS: ShownRuns = "automation";

/** What decides whether a session is shown. */
export interface SessionVisibility {
  /** Which runs count besides launch directories that are hidden (see `ShownRuns`). */
  runs: ShownRuns;
  /** Launch directories whose sessions are never shown (Kairos's own summary runs). */
  hiddenCwds: readonly string[];
}

/** Directories hidden unless a caller says otherwise: where Kairos itself runs `claude -p`. */
export const DEFAULT_HIDDEN_CWDS: readonly string[] = [SUMMARIZER_CWD];

/**
 * The visibility as it applies now: automation runs, plus trial runs when the UI asks for them,
 * and `hiddenCwds`. Read per request, so turning trial runs on or off applies to the next one.
 * The read queries and the live page both take it from here, so they agree on what is shown.
 */
export function currentVisibility(
  db: Database,
  hiddenCwds: readonly string[] = DEFAULT_HIDDEN_CWDS,
): SessionVisibility {
  return { runs: storedShowTrials(db) ? "all" : DEFAULT_SHOWN_RUNS, hiddenCwds };
}

/** Whether a run of `kind` (null for a person's session) counts under `runs`. */
export function isRunShown(kind: RunKind | null, runs: ShownRuns): boolean {
  if (kind === null) return true;
  if (kind === RUN_KINDS.automation) return runs !== "people";
  return runs === "all";
}

/** A string as an SQL literal. */
function sqlString(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/** SQL condition on `alias` for the sessions `runs` counts, the same rule as `isRunShown`. */
function shownRunsSql(runs: ShownRuns, alias: string): string {
  const person = `${alias}.prompt_count > 0`;
  if (runs === "people") return person;
  if (runs === "all") return `(${person} OR ${headlessSql(alias)})`;
  return `(${person} OR (${headlessSql(alias)} AND ${automationSql(alias)}))`;
}

/**
 * SQL condition on the sessions table aliased `alias` that keeps visible sessions: the runs
 * `v.runs` counts, minus any launched in a hidden directory.
 * Built as text rather than bound because the queries number their parameters; every value comes
 * from server configuration (a setting and fixed paths), never text from a request.
 */
export function visibleSessionSql(v: SessionVisibility, alias = "s"): string {
  const shown = shownRunsSql(v.runs, alias);
  if (v.hiddenCwds.length === 0) return shown;
  const hidden = v.hiddenCwds.map(sqlString).join(", ");
  // COALESCE: a session with no launch directory recorded would otherwise compare as NULL and vanish
  return `(${shown} AND COALESCE(${alias}.launch_cwd, '') NOT IN (${hidden}))`;
}

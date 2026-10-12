// Which sessions the calendar, search and summaries look at. Kept in one place so every read
// query agrees on what a visible session is.
import { SUMMARIZER_CWD } from "./paths.ts";

/** What decides whether a session is shown. */
export interface SessionVisibility {
  /** Also show headless sessions (no human prompt, started through the SDK, e.g. `claude -p`). */
  headless: boolean;
  /** Launch directories whose sessions are never shown (Kairos's own summary runs). */
  hiddenCwds: readonly string[];
}

/** Directories hidden unless a caller says otherwise: where Kairos itself runs `claude -p`. */
export const DEFAULT_HIDDEN_CWDS: readonly string[] = [SUMMARIZER_CWD];

/** A string as an SQL literal. */
function sqlString(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/**
 * SQL condition on the sessions table aliased `alias` that keeps visible sessions: ones with a
 * human prompt, plus headless ones when asked for, minus any launched in a hidden directory.
 * Built as text rather than bound because the queries number their parameters; every value comes
 * from server configuration (a boolean setting and fixed paths), never text from a request.
 */
export function visibleSessionSql(v: SessionVisibility, alias = "s"): string {
  const shown = v.headless
    ? `(${alias}.prompt_count > 0 OR ${alias}.sdk_prompt_count > 0)`
    : `${alias}.prompt_count > 0`;
  if (v.hiddenCwds.length === 0) return shown;
  const hidden = v.hiddenCwds.map(sqlString).join(", ");
  // COALESCE: a session with no launch directory recorded would otherwise compare as NULL and vanish
  return `(${shown} AND COALESCE(${alias}.launch_cwd, '') NOT IN (${hidden}))`;
}

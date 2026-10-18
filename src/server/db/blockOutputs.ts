// Which outputs (commits, PRs, Claude Code's recaps) belong to a work block. They are recorded a
// little after the work that made them, so a block owns them for a grace period after its end;
// but a block split off where the topic changed can start seconds later, so the period stops
// where the session's next block starts and no output counts twice.
import { MINUTE } from "../../shared/dates.ts";

/** A PR link may be recorded a little after the PR is created, so a block owns this much more. */
export const ARTIFACT_GRACE_MS = 5 * MINUTE;

/** SQL expressions naming a block's session, start and end in the query using it. */
export interface BlockColumns {
  session: string;
  start: string;
  end: string;
}

/**
 * SQL for the last moment whose outputs block `b` owns: `graceMs` after its end, or just before
 * the session's next block starts if that is sooner, but never before its own end (a split can
 * fall between two records of the same millisecond). The `segments (session_id, start)` index
 * finds the next block.
 */
export function outputsUntilSql(b: BlockColumns, graceMs = ARTIFACT_GRACE_MS): string {
  const graceEnd = `${b.end} + ${graceMs}`;
  const nextStart = `(SELECT MIN(n.start) FROM segments n WHERE n.session_id = ${b.session} AND n.start > ${b.start})`;
  return `MAX(${b.end}, MIN(${graceEnd}, COALESCE(${nextStart} - 1, ${graceEnd})))`;
}

/** `outputsUntilSql` for a row of `alias` with the segments columns (`session_id`, `start`, `end`). */
export function blockOutputsUntilSql(alias: string): string {
  return outputsUntilSql({
    session: `${alias}.session_id`,
    start: `${alias}.start`,
    end: `${alias}.end`,
  });
}

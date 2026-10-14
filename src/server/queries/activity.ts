// What was done within a work block: tool calls, edits, errors, commits and PRs, Claude's time and
// effort. Subagents are included and copies in a continued session left out throughout.
import type { Database } from "bun:sqlite";
import type { Activity, Artifact } from "../../shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../../shared/constants.ts";
import { EDIT_TOOLS } from "./editTools.ts";
import { OWN_ROWS_IN_RANGE } from "./sql.ts";

/** The part of `Activity` counted from artifacts. */
type ArtifactCounts = Pick<Activity, "commits" | "prs" | "merges">;
/** The part of `Activity` counted from messages. */
type MessageCounts = Omit<Activity, keyof ArtifactCounts | "claudeMs" | "effort">;

/** What was done within a work block (including subagents, excluding copies in continued sessions). */
export function blockActivity(db: Database, sessionId: string, from: number, to: number): Activity {
  const m = messageCounts(db, sessionId, from, to);
  const artifacts = artifactCounts(db, sessionId, from, to);
  return {
    commits: artifacts?.commits ?? 0,
    prs: artifacts?.prs ?? 0,
    merges: artifacts?.merges ?? 0,
    filesEdited: m?.filesEdited ?? 0,
    toolCalls: m?.toolCalls ?? 0,
    subagents: m?.subagents ?? 0,
    toolErrors: m?.toolErrors ?? 0,
    interrupts: m?.interrupts ?? 0,
    apiErrors: m?.apiErrors ?? 0,
    compactions: m?.compactions ?? 0,
    claudeMs: claudeMs(db, sessionId, from, to),
    effort: dominantEffort(db, sessionId, from, to),
  };
}

/** A work block's commits and PRs, each in time order. */
export interface BlockArtifacts {
  prs: Artifact[];
  commits: Artifact[];
}

/** Commits and PRs made within a work block (counted the same way as `blockActivity`). */
export function blockArtifacts(
  db: Database,
  sessionId: string,
  from: number,
  to: number,
): BlockArtifacts {
  return {
    prs: artifactsOfKind(db, sessionId, "pr", { from, to }),
    commits: artifactsOfKind(db, sessionId, "commit", { from, to }),
  };
}

/** One kind of artifact made within a work block, allowing for ones recorded just after it ends. */
function artifactsOfKind(
  db: Database,
  sessionId: string,
  kind: Artifact["kind"],
  range: { from: number; to: number },
): Artifact[] {
  return db
    .query<Artifact, [string, number, number, string]>(
      `SELECT kind, ref, title, ts FROM artifacts
       WHERE ${OWN_ROWS_IN_RANGE} AND kind = ?4 ORDER BY ts`,
    )
    .all(sessionId, range.from, range.to + ARTIFACT_GRACE_MS, kind);
}

/** The activity counts that come from messages (tool calls, edits, errors, ...). */
function messageCounts(
  db: Database,
  sessionId: string,
  from: number,
  to: number,
): MessageCounts | null {
  return db
    .query<MessageCounts, [string, number, number]>(
      `SELECT COALESCE(SUM(kind = 'tool_use'), 0) AS toolCalls,
              COUNT(DISTINCT CASE WHEN kind = 'tool_use' AND tool_name IN (${EDIT_TOOLS}) AND text != ''
                                  THEN text END) AS filesEdited,
              COALESCE(SUM(kind = 'tool_use' AND agent_id IS NULL AND tool_name IN ('Agent', 'Task')), 0) AS subagents,
              COALESCE(SUM(kind = 'tool_result' AND is_error = 1), 0) AS toolErrors,
              COALESCE(SUM(kind = 'interrupt'), 0) AS interrupts,
              COALESCE(SUM(kind = 'error'), 0) AS apiErrors,
              COALESCE(SUM(kind = 'compact'), 0) AS compactions
       FROM messages WHERE ${OWN_ROWS_IN_RANGE}`,
    )
    .get(sessionId, from, to);
}

/** Commits, PRs and merges within a work block, allowing for ones recorded just after it ends. */
function artifactCounts(
  db: Database,
  sessionId: string,
  from: number,
  to: number,
): ArtifactCounts | null {
  return db
    .query<ArtifactCounts, [string, number, number]>(
      `SELECT COALESCE(SUM(kind = 'commit'), 0) AS commits, COALESCE(SUM(kind = 'pr'), 0) AS prs,
              COALESCE(SUM(kind = 'merge'), 0) AS merges
       FROM artifacts WHERE ${OWN_ROWS_IN_RANGE}`,
    )
    .get(sessionId, from, to + ARTIFACT_GRACE_MS);
}

/** Time Claude spent on turns ending inside a work block, or null if none were timed. */
function claudeMs(db: Database, sessionId: string, from: number, to: number): number | null {
  // A turn starts and ends within one block, so its end places it
  return (
    db
      .query<{ ms: number | null }, [string, number, number]>(
        `SELECT SUM(duration_ms) AS ms FROM turns WHERE ${OWN_ROWS_IN_RANGE}`,
      )
      .get(sessionId, from, to)?.ms ?? null
  );
}

/** The effort level behind most of the output in a work block, or null if none was recorded. */
function dominantEffort(db: Database, sessionId: string, from: number, to: number): string | null {
  return (
    db
      .query<{ effort: string }, [string, number, number]>(
        `SELECT effort FROM usage WHERE ${OWN_ROWS_IN_RANGE} AND effort IS NOT NULL
         GROUP BY effort ORDER BY SUM(output) DESC LIMIT 1`,
      )
      .get(sessionId, from, to)?.effort ?? null
  );
}

// Sessions as the API shows them: the calendar's session and the drawer's detail, and the cheap
// existence checks the API makes before acting on one.
import type { Database } from "bun:sqlite";
import type {
  Artifact,
  CalendarSegment,
  CalendarSession,
  Project,
  Section,
  SessionDetail,
  Subagent,
} from "../../shared/api.ts";
import { MINUTE } from "../../shared/dates.ts";
import { sessionCloses, sessionOpens } from "../summarize/ledger/openItems.ts";
import { type BlockScope, blockSetOf, blocksFacts, sectionRows, toSection } from "./blocks.ts";
import { projectById } from "./projects.ts";
import { listedArtifactsSql } from "./sql.ts";
import type { SummaryState } from "./summaryState.ts";
import { displayBranch, title } from "./titles.ts";
import { sessionUsage } from "./usage.ts";

/** Within this long after the last activity, a session counts as in progress. */
export const ACTIVE_WINDOW_MS = 5 * MINUTE;

/** A row of the sessions table. */
export interface SessionRow {
  id: string;
  project_id: number | null;
  launch_cwd: string | null;
  label: string | null;
  branch: string | null;
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
  away_summary: string | null;
  continued_in: string | null;
  started_at: number | null;
  ended_at: number | null;
  prompt_count: number;
  scheduled_runs: number;
}

/** Whether a session that last did something at `endedAt` still counts as in progress. */
export function isActive(endedAt: number | null, now: number): boolean {
  return endedAt !== null && now - endedAt < ACTIVE_WINDOW_MS;
}

/** What a calendar session adds to its row: links to other sessions, liveness and its blocks. */
export interface CalendarSessionParts {
  continued: boolean;
  active: boolean;
  segments: CalendarSegment[];
}

/** A session row as the calendar shows it. */
export function toCalendarSession(r: SessionRow, parts: CalendarSessionParts): CalendarSession {
  return {
    id: r.id,
    projectId: r.project_id,
    label: r.label,
    branch: displayBranch(r.branch),
    title: title(r),
    startedAt: r.started_at ?? 0,
    endedAt: r.ended_at ?? 0,
    promptCount: r.prompt_count,
    scheduledRuns: r.scheduled_runs,
    headless: r.prompt_count === 0,
    continued: parts.continued,
    active: parts.active,
    segments: parts.segments,
  };
}

/** What the drawer's detail adds to the session row, each read from its own table. */
export interface SessionDetailParts {
  project: Project | null;
  sections: Section[];
  active: boolean;
  continuedFrom: string | null;
  artifacts: Artifact[];
  subagents: Subagent[];
  usage: SessionDetail["usage"];
}

/** A session row as the drawer shows it. */
export function toSessionDetail(s: SessionRow, parts: SessionDetailParts): SessionDetail {
  return {
    id: s.id,
    project: parts.project,
    launchCwd: s.launch_cwd,
    label: s.label,
    branch: s.branch,
    title: title(s),
    sections: parts.sections,
    awaySummary: s.away_summary,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    active: parts.active,
    promptCount: s.prompt_count,
    scheduledRuns: s.scheduled_runs,
    headless: s.prompt_count === 0,
    continuedFrom: parts.continuedFrom,
    continuedIn: s.continued_in,
    commits: parts.artifacts.filter((a) => a.kind === "commit"),
    prs: parts.artifacts.filter((a) => a.kind === "pr"),
    subagents: parts.subagents,
    usage: parts.usage,
  };
}

/** What the session drawer shows (sections, artifacts, subagents, usage); null if absent. */
export function sessionDetail(
  db: Database,
  id: string,
  now: number,
  summaries: SummaryState,
): SessionDetail | null {
  const s = db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);
  if (!s) return null;
  return toSessionDetail(s, {
    project: s.project_id ? projectById(db, s.project_id) : null,
    sections: sections(db, id, title(s), summaries),
    active: isActive(s.ended_at, now),
    continuedFrom: predecessorOf(db, id),
    artifacts: sessionArtifacts(db, id),
    subagents: subagents(db, id),
    usage: sessionUsage(db, id),
  });
}

/** Whether the session exists. */
export function hasSession(db: Database, id: string): boolean {
  return (
    db.query<{ x: number }, [string]>("SELECT 1 AS x FROM sessions WHERE id = ?").get(id) !== null
  );
}

/** Whether the session exists and has a section starting at `start`. */
export function hasSection(db: Database, id: string, start: number): boolean {
  return (
    db
      .query<{ x: number }, [string, number]>(
        `SELECT 1 AS x FROM segments g JOIN sessions s ON s.id = g.session_id
         WHERE g.session_id = ? AND g.start = ?`,
      )
      .get(id, start) !== null
  );
}

/**
 * SQL condition: another session continues the one aliased `alias` (it is marked as continued).
 * `predecessorOf` asks the same for one session by ID.
 */
export function hasPredecessorSql(alias: string): string {
  return `EXISTS (SELECT 1 FROM sessions p WHERE p.continued_in = ${alias}.id)`;
}

/** The session this one was continued from, or null. */
export function predecessorOf(db: Database, sessionId: string): string | null {
  return (
    db
      .query<{ id: string }, [string]>("SELECT id FROM sessions WHERE continued_in = ? LIMIT 1")
      .get(sessionId)?.id ?? null
  );
}

/** The session's commits and PRs in time order, excluding copies from the previous session. */
function sessionArtifacts(db: Database, sessionId: string): Artifact[] {
  return db
    .query<Artifact, [string]>(
      `SELECT kind, ref, title, ts FROM artifacts
       WHERE session_id = ? AND ${listedArtifactsSql()} ORDER BY ts`,
    )
    .all(sessionId);
}

/** The session's subagents, with the span of their messages, in start order. */
function subagents(db: Database, sessionId: string): Subagent[] {
  return db
    .query<Subagent, [string]>(
      `SELECT a.id, a.agent_type AS agentType, a.description, a.tool_use_id AS toolUseId,
              MIN(m.ts) AS startedAt, MAX(m.ts) AS endedAt
       FROM subagents a LEFT JOIN messages m ON m.session_id = a.session_id AND m.agent_id = a.id
       WHERE a.session_id = ? GROUP BY a.id ORDER BY startedAt`,
    )
    .all(sessionId);
}

/** Every section of the session with its summary state, usage and activity, in order. */
function sections(
  db: Database,
  sessionId: string,
  sessionTitle: string,
  summaries: SummaryState,
): Section[] {
  const closes = sessionCloses(db, sessionId);
  const opens = sessionOpens(db, sessionId);
  const scope: BlockScope = { joins: "", where: "g.session_id = ?1", params: [sessionId] };
  const facts = blocksFacts(db, blockSetOf(scope));
  return sectionRows(db, scope).map((g) =>
    toSection(
      g,
      sessionTitle,
      {
        pending: summaries.isPending(sessionId, g.start),
        error: summaries.errorOf(sessionId, g.start),
        closes: closes.get(g.start) ?? [],
        opens: opens.get(g.start) ?? [],
      },
      facts(sessionId, g.start),
    ),
  );
}

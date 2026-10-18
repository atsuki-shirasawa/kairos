// The calendar's view of a period: the sessions whose work blocks overlap it, where those blocks
// fall, and the nearest work outside it. `visible` is a `visibleSessionSql` condition on alias `s`.
import type { Database } from "bun:sqlite";
import type { CalendarSegment, CalendarSession, Span } from "../../shared/api.ts";
import { blocksArtifacts } from "./activity.ts";
import {
  type BlockScope,
  blockSetOf,
  blocksFacts,
  sectionRows,
  toCalendarSegment,
} from "./blocks.ts";
import { hasPredecessorSql, isActive, type SessionRow, toCalendarSession } from "./sessions.ts";
import { title } from "./titles.ts";

/** A half-open period [from, to) in epoch ms, as the API's `?from=&to=` gives it. */
type Period = { from: number; to: number };

/**
 * Overlap with [?1, ?2): a block that ends exactly at `from` still shows, as `spans` and
 * `calendarSessions` agree.
 */
const OVERLAPS = "g.start < ?2 AND g.end >= ?1";

/** A session row with whether another session continues from it, asked for in the same query. */
type CalendarRow = SessionRow & { has_predecessor: number };

/** Selects `CalendarRow`s from `sessions s`; the caller adds the WHERE and the order. */
const CALENDAR_ROW_SELECT = `SELECT s.*, ${hasPredecessorSql("s")} AS has_predecessor FROM sessions s`;

/**
 * Visible sessions whose work blocks overlap the period, with those blocks, by start time. Every
 * block's facts are gathered in one query per kind for the whole period, not per block.
 */
export function calendarSessions(
  db: Database,
  visible: string,
  period: Period,
  now: number,
): CalendarSession[] {
  const rows = db
    .query<CalendarRow, number[]>(
      `${CALENDAR_ROW_SELECT}
       WHERE ${visible}
         AND EXISTS (SELECT 1 FROM segments g WHERE g.session_id = s.id AND ${OVERLAPS})
       ORDER BY s.started_at`,
    )
    .all(period.from, period.to);
  const scope: BlockScope = {
    joins: "JOIN sessions s ON s.id = g.session_id",
    where: `${visible} AND ${OVERLAPS}`,
    params: [period.from, period.to],
  };
  return toCalendarSessions(db, rows, scope, now);
}

/** Session rows as the calendar shows them, each with its blocks in the scope. */
function toCalendarSessions(
  db: Database,
  rows: CalendarRow[],
  scope: BlockScope,
  now: number,
): CalendarSession[] {
  const segments = segmentsIn(db, scope, rows);
  return rows.map((r) =>
    toCalendarSession(r, {
      continued: r.continued_in !== null || r.has_predecessor === 1,
      active: isActive(r.ended_at, now),
      segments: segments.get(r.id) ?? [],
    }),
  );
}

/** The scope's work blocks, as the calendar shows them, by session. */
function segmentsIn(
  db: Database,
  scope: BlockScope,
  sessions: SessionRow[],
): Map<string, CalendarSegment[]> {
  const artifacts = blocksArtifacts(db, blockSetOf(scope));
  const facts = blocksFacts(db, blockSetOf(scope));
  const titles = new Map(sessions.map((r) => [r.id, title(r)]));
  const segments = sectionRows(db, scope).map((g) => ({
    sessionId: g.session_id,
    segment: toCalendarSegment(
      g,
      titles.get(g.session_id) ?? "",
      artifacts(g.session_id, g.start),
      facts(g.session_id, g.start),
    ),
  }));
  return new Map(
    [...Map.groupBy(segments, (s) => s.sessionId)].map(([id, list]) => [
      id,
      list.map((s) => s.segment),
    ]),
  );
}

/** Starts of the nearest work blocks before and after the period (from visible sessions). */
export function neighbors(
  db: Database,
  visible: string,
  period: Period,
): { prev: number | null; next: number | null } {
  const one = (sql: string, t: number) =>
    db.query<{ t: number | null }, [number]>(sql).get(t)?.t ?? null;
  const base = `FROM segments g JOIN sessions s ON s.id = g.session_id WHERE ${visible}`;
  return {
    prev: one(`SELECT MAX(g.start) AS t ${base} AND g.end < ?`, period.from),
    next: one(`SELECT MIN(g.start) AS t ${base} AND g.start >= ?`, period.to),
  };
}

/** Times of work blocks overlapping the period. Overlap is decided as in `calendarSessions`. */
export function spans(db: Database, visible: string, period: Period): Span[] {
  return db
    .query<Span, [number, number]>(
      `SELECT g.start, g.end, s.project_id AS projectId
       FROM segments g JOIN sessions s ON s.id = g.session_id
       WHERE ${visible} AND ${OVERLAPS}
       ORDER BY g.start, g.end`,
    )
    .all(period.from, period.to);
}

// The calendar's view of a period: the sessions whose work blocks overlap it, where those blocks
// fall, and the nearest work outside it. `visible` is a `visibleSessionSql` condition on alias `s`.
import type { Database } from "bun:sqlite";
import type { CalendarSegment, CalendarSession, Span } from "../../shared/api.ts";
import { blockArtifacts } from "./activity.ts";
import { blockFacts, SECTION_SELECT, type SectionRow, toCalendarSegment } from "./blocks.ts";
import { isActive, predecessorOf, type SessionRow, toCalendarSession } from "./sessions.ts";
import { title } from "./titles.ts";

/** A half-open period [from, to) in epoch ms, as the API's `?from=&to=` gives it. */
type Period = { from: number; to: number };

/**
 * Overlap with [?from, ?to): a block that ends exactly at `from` still shows, as `spans` and
 * `calendarSessions` agree.
 */
const OVERLAPS = "g.start < ?2 AND g.end >= ?1";

/** Visible sessions whose work blocks overlap the period, with those blocks, by start time. */
export function calendarSessions(
  db: Database,
  visible: string,
  period: Period,
  now: number,
): CalendarSession[] {
  const rows = db
    .query<SessionRow, [number, number]>(
      `SELECT s.* FROM sessions s
       WHERE ${visible}
         AND EXISTS (SELECT 1 FROM segments g WHERE g.session_id = s.id AND ${OVERLAPS})
       ORDER BY s.started_at`,
    )
    .all(period.from, period.to);
  return rows.map((r) =>
    toCalendarSession(r, {
      continued: r.continued_in !== null || predecessorOf(db, r.id) !== null,
      active: isActive(r.ended_at, now),
      segments: segmentsIn(db, r, period),
    }),
  );
}

/** The session's work blocks overlapping the period, as the calendar shows them. */
function segmentsIn(db: Database, r: SessionRow, period: Period): CalendarSegment[] {
  const sessionTitle = title(r);
  return db
    .query<SectionRow, [string, number, number]>(
      `${SECTION_SELECT} WHERE g.session_id = ?1 AND g.start < ?3 AND g.end >= ?2 ORDER BY g.start`,
    )
    .all(r.id, period.from, period.to)
    .map((g) =>
      toCalendarSegment(
        g,
        sessionTitle,
        blockArtifacts(db, r.id, g.start, g.end),
        blockFacts(db, r.id, g.start, g.end),
      ),
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

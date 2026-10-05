import type { CalendarSession } from "@shared/api.ts";
import { useMemo } from "react";
import type { SegmentMatch } from "@/lib/filter.ts";
import { elapsedInPeriod } from "@/lib/periodChange.ts";
import { type PeriodSummary, sessionsUntil, summarize } from "@/lib/summary.ts";

/**
 * Summaries of the period [from, to) and of the period before (null while it loads). While the
 * period is running, the one before is counted only up to the same point, so a week seen on Monday
 * isn't compared with the whole of last week.
 */
export function usePeriodSummaries({
  from,
  to,
  days,
  sessions,
  previous,
  matches,
  now,
}: {
  from: number;
  to: number;
  days: number[];
  sessions: CalendarSession[];
  previous: { days: number[]; sessions: CalendarSession[] } | null;
  matches: SegmentMatch;
  now: number;
}): { summary: PeriodSummary; before: PeriodSummary | null; soFar: boolean } {
  const summary = useMemo(() => summarize(days, sessions, matches), [days, sessions, matches]);
  const elapsed = elapsedInPeriod(now, from, to);
  const before = useMemo(() => {
    if (!previous) return null;
    const start = previous.days[0] ?? 0;
    const list =
      elapsed === null ? previous.sessions : sessionsUntil(previous.sessions, start + elapsed);
    return summarize(previous.days, list, matches);
  }, [previous, matches, elapsed]);
  return { summary, before, soFar: elapsed !== null };
}

import type { Project } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { useMemo } from "react";
import { useCalendar, useSpans } from "@/hooks/queries.ts";
import {
  dayEnd,
  lastWorkday,
  type WorkdayProject,
  workdayByProject,
  workdaySearchRange,
} from "@/lib/today.ts";

/** The last workday as the home page shows it. */
export type LastWorkday =
  | { status: "loading" }
  /** Nothing to list in the weeks searched. */
  | { status: "none" }
  | { status: "ready"; day: number; work: WorkdayProject[] };

/**
 * Finds the last day with work before today and fetches it, grouped by project once per fetch
 * rather than on every tick of the clock. The weeks before are read as spans (times only), so
 * finding the day stays cheap; only that one day's sessions are fetched in full.
 */
export function useLastWorkday(now: number, projects: ReadonlyMap<number, Project>): LastWorkday {
  const today = startOfDay(now);
  const range = workdaySearchRange(today);
  const spans = useSpans(range.from, range.to, true);
  // After midnight the previous range's spans stay as a placeholder; they would name the wrong day
  const known = spans.data && !spans.isPlaceholderData;
  const day = known ? lastWorkday(spans.data.spans, today, projects) : null;
  const last = useCalendar(day ?? 0, day === null ? 0 : dayEnd(day), day !== null);
  const fresh = last.data && !last.isPlaceholderData ? last.data.sessions : null;
  const work = useMemo(
    () => (fresh && day !== null ? workdayByProject(fresh, day, projects) : null),
    [fresh, day, projects],
  );
  if (!known) return { status: "loading" };
  if (day === null) return { status: "none" };
  if (!work) return { status: "loading" };
  return { status: "ready", day, work };
}

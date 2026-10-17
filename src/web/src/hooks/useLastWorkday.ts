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
 * The last day with work before today: undefined while the weeks before load, null when they hold
 * none. They are read as spans (times only), so finding the day stays cheap.
 */
export function useLastWorkdayDay(
  now: number,
  projects: ReadonlyMap<number, Project>,
  enabled = true,
): number | null | undefined {
  const today = startOfDay(now);
  const range = workdaySearchRange(today);
  const spans = useSpans(range.from, range.to, enabled);
  // After midnight the previous range's spans stay as a placeholder; they would name the wrong day
  if (!spans.data || spans.isPlaceholderData) return undefined;
  return lastWorkday(spans.data.spans, today, projects);
}

/**
 * Finds the last day with work before today and fetches it, grouped by project once per fetch
 * rather than on every tick of the clock. Only that one day's sessions are fetched in full.
 */
export function useLastWorkday(now: number, projects: ReadonlyMap<number, Project>): LastWorkday {
  const found = useLastWorkdayDay(now, projects);
  const day = found ?? null;
  const last = useCalendar(day ?? 0, day === null ? 0 : dayEnd(day), day !== null);
  const fresh = last.data && !last.isPlaceholderData ? last.data.sessions : null;
  const work = useMemo(
    () => (fresh && day !== null ? workdayByProject(fresh, day, projects) : null),
    [fresh, day, projects],
  );
  if (found === undefined) return { status: "loading" };
  if (day === null) return { status: "none" };
  if (!work) return { status: "loading" };
  return { status: "ready", day, work };
}

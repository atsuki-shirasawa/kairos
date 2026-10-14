import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import { useCalendar } from "@/hooks/queries.ts";
import {
  type FilteredSessions,
  type PreviousPeriod,
  useFilteredSessions,
  usePreviousPeriod,
  useRecapBodies,
} from "@/hooks/usePeriodSessions.ts";
import { rangeOf } from "@/lib/dates.ts";
import type { UrlState } from "@/lib/urlState.ts";

/** The shown period's data, as the toolbar, the period body and the drawer need it. */
export interface PeriodData extends FilteredSessions {
  /** The period [from, to) and its days (midnight). */
  from: number;
  to: number;
  days: number[];
  /** The period's query, for its loading and error state and the nearest days with work. */
  calendar: ReturnType<typeof useCalendar>;
  projects: Project[];
  projectMap: Map<number, Project>;
  /** Every session of the period, before hiding and filtering. */
  sessions: CalendarSession[];
  /** The period before, for the summary's comparison. null while it loads or off the summary. */
  previous: PreviousPeriod | null;
  /** Written recap bodies by project ID, quoted in the copied report. */
  recapBodies: Map<number, string>;
}

/** Fetches the period the URL state shows and derives what each part of the screen draws. */
export function usePeriodData(state: UrlState): PeriodData {
  const { from, to, days } = useMemo(
    () => rangeOf(state.view, state.anchor),
    [state.view, state.anchor],
  );
  const calendar = useCalendar(from, to);
  const projects = calendar.data?.projects ?? [];
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const sessions = calendar.data?.sessions ?? [];
  const filtered = useFilteredSessions(calendar.data?.sessions, projectMap, state.filter);
  const previous = usePreviousPeriod(
    state.view,
    state.anchor,
    projectMap,
    state.filter,
    state.layout === "summary",
  );
  const recapBodies = useRecapBodies(from, to);
  return {
    ...filtered,
    from,
    to,
    days,
    calendar,
    projects,
    projectMap,
    sessions,
    previous,
    recapBodies,
  };
}

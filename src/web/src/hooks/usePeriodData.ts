import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import { useCalendar, useProjects } from "@/hooks/queries.ts";
import {
  type FilteredSessions,
  type PreviousPeriod,
  useFilteredSessions,
  useMonthEdgeSessions,
  usePreviousPeriod,
  useRecapBodies,
} from "@/hooks/usePeriodSessions.ts";
import { rangeOf } from "@/lib/dates.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import { withEdgeSessions } from "@/lib/monthGrid.ts";
import type { UrlState } from "@/lib/urlState.ts";

/** The shown period's data, as the toolbar, the period body and the drawer need it. */
export interface PeriodData extends FilteredSessions {
  /** The period [from, to) and its days (midnight). */
  from: number;
  to: number;
  days: number[];
  /** The period's query, for its loading and error state and the nearest days with work. */
  calendar: ReturnType<typeof useCalendar>;
  /** Whether the server stopped answering (the period's or the projects' request failed). */
  disconnected: boolean;
  /**
   * Whether the period and the projects have both arrived. Until then the period's work is held
   * back: a session of a hidden project would show until its project said it was hidden.
   */
  loaded: boolean;
  projects: Project[];
  projectMap: Map<number, Project>;
  /**
   * `visible` plus the work on the adjacent months' days that pad a month grid. The same as
   * `visible` for other views.
   */
  gridSessions: CalendarSession[];
  /** Every session of the period, before hiding and filtering. */
  sessions: CalendarSession[];
  /** The period before, for the summary's comparison. null while it loads or off the summary. */
  previous: PreviousPeriod | null;
  /** Written recap bodies by project ID, quoted in the copied report. */
  recapBodies: Map<number, string>;
}

/**
 * Fetches the period the URL state shows and derives what each part of the screen draws. A layout
 * without a period fetches only the projects, which every page colors and names its work by.
 */
export function usePeriodData(state: UrlState): PeriodData {
  const layout = LAYOUTS[state.layout];
  const { from, to, days } = useMemo(
    () => rangeOf(state.view, state.anchor),
    [state.view, state.anchor],
  );
  const calendar = useCalendar(from, to, layout.hasPeriod);
  const projectsQuery = useProjects();
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projectsKnown = projectsQuery.isSuccess;
  const periodSessions = projectsKnown ? calendar.data?.sessions : undefined;
  const sessions = periodSessions ?? [];
  const filtered = useFilteredSessions({
    sessions: periodSessions,
    projects: projectMap,
    filter: state.filter,
    searchable: layout.hasPeriod,
  });
  const previous = usePreviousPeriod(
    state.view,
    state.anchor,
    projectMap,
    state.filter,
    layout.comparesPrevious && projectsKnown,
  );
  const recapBodies = useRecapBodies(from, to, layout.hasPeriod);
  const edges = useMonthEdgeSessions(
    state.anchor,
    projectMap,
    state.filter,
    state.view === "month" && layout.padsMonth && projectsKnown,
  );
  const gridSessions = useMemo(
    () => withEdgeSessions(filtered.visible, edges),
    [filtered.visible, edges],
  );
  return {
    ...filtered,
    gridSessions,
    from,
    to,
    days,
    calendar,
    disconnected: calendar.isError || projectsQuery.isError,
    loaded: calendar.isSuccess && projectsKnown,
    projects,
    projectMap,
    sessions,
    previous,
    recapBodies,
  };
}

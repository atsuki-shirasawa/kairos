// What the shown period puts on screen once hidden projects, filters and the keyword apply, plus
// the data the summary and the copied report compare or quote alongside it.
import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import { useCalendar, useRecaps, useSearch } from "@/hooks/queries.ts";
import { rangeOf, shift, type View } from "@/lib/dates.ts";
import {
  type Filter,
  hideSessions,
  hitKey,
  narrowSessions,
  type SegmentMatch,
  searchQuery,
  segmentMatcher,
  withProjects,
} from "@/lib/filter.ts";

/** The period's sessions as each part of the screen needs them. */
export interface FilteredSessions {
  /** Sessions not hidden (hidden projects, quick questions when hidden). */
  visible: CalendarSession[];
  /** Whether a block passes the keyword and the filter menu's conditions. */
  matches: SegmentMatch;
  /** `visible` narrowed to the matching blocks. */
  focused: CalendarSession[];
  /** The server-side search for the keyword, shown in the toolbar. */
  search: ReturnType<typeof useSearch>;
}

/**
 * Applies hiding and the filter to the period's sessions. The keyword also matches blocks the
 * server found in text the calendar doesn't hold (summary body, prompts, PRs...).
 */
export function useFilteredSessions(
  sessions: CalendarSession[] | undefined,
  projects: Map<number, Project>,
  filter: Filter,
): FilteredSessions {
  const visible = useMemo(
    () => hideSessions(sessions ?? [], projects, filter),
    [sessions, projects, filter],
  );
  const search = useSearch(searchQuery(filter));
  const hitKeys = useMemo(
    () =>
      new Set(
        search.current ? (search.data?.hits ?? []).map((h) => hitKey(h.sessionId, h.start)) : [],
      ),
    [search.current, search.data],
  );
  const matches = useMemo(
    () => segmentMatcher(filter, projects, hitKeys),
    [filter, projects, hitKeys],
  );
  const focused = useMemo(() => narrowSessions(visible, matches), [visible, matches]);
  return { visible, matches, focused, search };
}

/** The period before the shown one, hidden the same way, for comparison. */
export interface PreviousPeriod {
  days: number[];
  sessions: CalendarSession[];
}

/**
 * The period before the shown one, or null until it has loaded. Fetched only when `enabled`
 * (the summary is the only view that compares).
 */
export function usePreviousPeriod(
  view: View,
  anchor: number,
  projects: Map<number, Project>,
  filter: Filter,
  enabled: boolean,
): PreviousPeriod | null {
  const before = useMemo(() => rangeOf(view, shift(view, anchor, -1)), [view, anchor]);
  const previous = useCalendar(before.from, before.to, enabled);
  // keepPreviousData would hand over an older period while the new one loads; compare only when current
  const data =
    previous.data && previous.data.from === before.from && !previous.isPlaceholderData
      ? previous.data
      : null;
  return useMemo(() => {
    if (!data) return null;
    const all = withProjects(projects, data.projects);
    return { days: before.days, sessions: hideSessions(data.sessions, all, filter) };
  }, [data, projects, before.days, filter]);
}

/**
 * Written recap bodies by project ID for the period. Wanted in the copied report from any layout,
 * so always fetched (shared with the summary view's query).
 */
export function useRecapBodies(from: number, to: number): Map<number, string> {
  const recaps = useRecaps(from, to, true).data?.recaps;
  return useMemo(
    () => new Map((recaps ?? []).flatMap((r) => (r.body ? [[r.projectId, r.body]] : []))),
    [recaps],
  );
}

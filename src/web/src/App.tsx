import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarGrid } from "@/components/CalendarGrid.tsx";
import { FilterChips } from "@/components/filter/FilterChips.tsx";
import { SessionDrawer } from "@/components/SessionDrawer.tsx";
import { SessionList } from "@/components/SessionList.tsx";
import { SummaryTabs, SummaryView } from "@/components/SummaryView.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCalendar, useSummaryLangSync } from "@/hooks/queries.ts";
import { useBlockStepping, useCloseDrawer } from "@/hooks/useBlockNavigation.ts";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import {
  useFilteredSessions,
  usePreviousPeriod,
  useRecapBodies,
} from "@/hooks/usePeriodSessions.ts";
import { useTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { useLocale } from "@/i18n/index.ts";
import { appMessages } from "@/i18n/messages/app.tsx";
import { dateLabel, rangeOf, shift, startOfDay } from "@/lib/dates.ts";
import { type Filter, hiddenReason, isFocused, withoutConditions } from "@/lib/filter.ts";
import { buildReport } from "@/lib/report.ts";

/**
 * Root component: owns the URL-synced view state and wires the toolbar, the period body
 * (calendar, summary or table) and the session drawer together, plus the global shortcuts.
 */
export function App() {
  const [theme, setTheme] = useTheme();
  const [state, update] = useUrlState();
  const now = useNow();
  useSummaryLangSync(useLocale());
  const progress = useLiveUpdates();
  const { from, to, days } = useMemo(
    () => rangeOf(state.view, state.anchor),
    [state.view, state.anchor],
  );
  const calendar = useCalendar(from, to);
  const projects = calendar.data?.projects ?? [];
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const sessions = calendar.data?.sessions ?? [];
  const { visible, matches, focused, search } = useFilteredSessions(
    calendar.data?.sessions,
    projectMap,
    state.filter,
  );
  const previousSessions = usePreviousPeriod(
    state.view,
    state.anchor,
    projectMap,
    state.filter,
    state.layout === "summary",
  );
  const recapBodies = useRecapBodies(from, to);
  const setFilter = useCallback((filter: Filter) => update({ filter }), [update]);

  const { prev, next, goTo } = useBlockStepping({
    focused,
    visible,
    from,
    to,
    session: state.session,
    at: state.at,
    update,
  });
  const closeDrawer = useCloseDrawer(update);

  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts({
    state,
    update,
    prev,
    next,
    goTo,
    closeDrawer,
    toggleMenu: () => setMenuOpen((v) => !v),
    focusSearch: () => searchRef.current?.focus(),
  });

  // Calendar and list render the same data differently, so they get the same props
  const body = {
    days,
    sessions: visible,
    projects: projectMap,
    selectedId: state.session,
    selectedAt: state.at,
    now,
    matches,
    onSelect: (session: string, at: number) => update({ session, at }, { push: true }),
    onOpenDay: (day: number) => update({ view: "day", anchor: day }),
  };

  const period = state.view;
  const m = appMessages();
  const summaryTabs = (
    <SummaryTabs
      table={state.layout === "list"}
      onTable={(table) => update({ layout: table ? "list" : "summary" })}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        view={state.view}
        layout={state.layout}
        anchor={state.anchor}
        now={now}
        projects={projects}
        sessions={sessions}
        filter={state.filter}
        onFilter={setFilter}
        progress={progress}
        onView={(view) => update({ view })}
        onLayout={(layout) => update({ layout })}
        onMove={(dir) => update({ anchor: shift(state.view, state.anchor, dir) })}
        onToday={() => update({ anchor: startOfDay(Date.now()) })}
        onJump={(day) => update({ anchor: day })}
        searchRef={searchRef}
        search={{
          hits: search.data?.hits ?? [],
          more: search.data?.more ?? false,
          loading: search.isFetching,
          error: search.error?.message ?? null,
        }}
        projectMap={projectMap}
        // The report follows what's on screen: hidden projects and filters apply
        report={() => buildReport(days, focused, projectMap, recapBodies)}
        hasWork={focused.length > 0}
        onOpenHit={(hit) =>
          update(
            { anchor: startOfDay(hit.start), session: hit.sessionId, at: hit.start },
            { push: true },
          )
        }
        theme={theme}
        onTheme={setTheme}
        menuOpen={menuOpen}
        onMenuOpen={setMenuOpen}
      />
      <FilterChips filter={state.filter} onFilter={setFilter} />
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {state.layout === "list" ? (
            <SessionList
              {...body}
              sort={state.sort}
              onSort={(sort) => update({ sort })}
              tabs={summaryTabs}
            />
          ) : state.layout === "summary" ? (
            <SummaryView
              {...body}
              view={state.view}
              from={from}
              to={to}
              previous={previousSessions}
              tabs={summaryTabs}
            />
          ) : (
            <CalendarGrid {...body} />
          )}
          {calendar.isError && <Notice>{m.disconnected(<code>kairos ensure</code>)}</Notice>}
          {calendar.isSuccess && visible.length === 0 && (
            <EmptyNotice
              period={period}
              progress={progress}
              hiddenBy={hiddenReason(sessions, projectMap)}
              prev={calendar.data.prev}
              next={calendar.data.next}
              onJump={(t) => update({ anchor: startOfDay(t) })}
            />
          )}
          {visible.length > 0 && focused.length === 0 && isFocused(state.filter) && (
            <NoMatchNotice
              period={period}
              onClear={() => setFilter({ ...withoutConditions(state.filter), q: "" })}
            />
          )}
        </main>
        {state.session && (
          <SessionDrawer
            id={state.session}
            at={state.at}
            onClose={closeDrawer}
            onSelect={(session, at) => update({ session, at }, { push: true })}
            onPrev={prev ? () => goTo(prev) : null}
            onNext={next ? () => goTo(next) : null}
          />
        )}
      </div>
    </div>
  );
}

/** When the period has nothing to show, explain why and what to do next. */
function EmptyNotice({
  period,
  progress,
  hiddenBy,
  prev,
  next,
  onJump,
}: {
  period: "week" | "day";
  progress: { done: number; total: number } | null;
  /** There are sessions, but all are hidden. What hid them. */
  hiddenBy: "project" | "brief" | null;
  prev: number | null;
  next: number | null;
  onJump: (t: number) => void;
}) {
  const m = appMessages();
  if (progress)
    return (
      <Notice>
        {m.ingesting(Math.floor((progress.done / Math.max(progress.total, 1)) * 100))}
      </Notice>
    );
  if (hiddenBy === "project") return <Notice>{m.hiddenByProject(period)}</Notice>;
  if (hiddenBy === "brief") return <Notice>{m.hiddenByBrief(period)}</Notice>;
  if (prev === null && next === null) return <Notice>{m.noRecordsYet}</Notice>;
  return (
    <Notice>
      <p>{m.noRecords(period)}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {prev !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(prev)}>
            <ChevronLeft />
            {m.previous}
            <span className="font-num text-muted-foreground">{dateLabel(prev)}</span>
          </Button>
        )}
        {next !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(next)}>
            {m.next}
            <span className="font-num text-muted-foreground">{dateLabel(next)}</span>
            <ChevronRight />
          </Button>
        )}
      </div>
    </Notice>
  );
}

/** The filter left nothing of a period that has work: say so and offer to clear it. */
function NoMatchNotice({ period, onClear }: { period: "week" | "day"; onClear: () => void }) {
  const m = appMessages();
  return (
    <Notice>
      <p>{m.noMatch(period)}</p>
      <Button variant="outline" size="xs" className="mt-2" onClick={onClear}>
        {m.clearFilter}
      </Button>
    </Notice>
  );
}

/** A status message floating over the top of the period body. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
      <div
        className="pointer-events-auto rounded-md border bg-popover px-4 py-2 text-center text-muted-foreground text-sm shadow-sm"
        role="status"
      >
        {children}
      </div>
    </div>
  );
}

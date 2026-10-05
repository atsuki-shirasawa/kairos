import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarGrid } from "@/components/CalendarGrid.tsx";
import { SessionDrawer } from "@/components/SessionDrawer.tsx";
import { SessionList } from "@/components/SessionList.tsx";
import { SummaryTabs, SummaryView } from "@/components/SummaryView.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useCalendar, useSearch, useSummaryLangSync } from "@/hooks/queries.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import { useTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { useLocale } from "@/i18n/index.ts";
import { appMessages } from "@/i18n/messages/app.tsx";
import { dateLabel, rangeOf, shift, startOfDay } from "@/lib/dates.ts";
import {
  type Filter,
  hideSessions,
  hitKey,
  isFocused,
  NO_FILTER,
  narrowSessions,
  segmentMatcher,
} from "@/lib/filter.ts";
import { orderedBlocks, selectedSegment, stepBlock } from "@/lib/navigation.ts";
import { buildReport } from "@/lib/report.ts";

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
  // The summary compares with the period before, so fetch it only there
  const before = useMemo(
    () => rangeOf(state.view, shift(state.view, state.anchor, -1)),
    [state.view, state.anchor],
  );
  const previous = useCalendar(before.from, before.to, state.layout === "summary");

  const projects = calendar.data?.projects ?? [];
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const sessions = calendar.data?.sessions ?? [];
  const visible = useMemo(
    () => hideSessions(calendar.data?.sessions ?? [], projectMap, state.filter),
    [calendar.data, projectMap, state.filter],
  );
  const search = useSearch(state.filter.q);
  // Blocks the server found by text the calendar doesn't hold (summary body, prompts, PRs...)
  const hitKeys = useMemo(
    () =>
      new Set(
        search.current ? (search.data?.hits ?? []).map((h) => hitKey(h.sessionId, h.start)) : [],
      ),
    [search.current, search.data],
  );
  const matches = useMemo(
    () => segmentMatcher(state.filter, projectMap, hitKeys),
    [state.filter, projectMap, hitKeys],
  );
  const focused = useMemo(() => narrowSessions(visible, matches), [visible, matches]);
  // keepPreviousData would hand over an older period while the new one loads; compare only when current
  const previousData =
    previous.data && previous.data.from === before.from && !previous.isPlaceholderData
      ? previous.data
      : null;
  const previousSessions = useMemo(() => {
    if (!previousData) return null;
    // Projects only seen last period still need their hidden flag
    const all = new Map(projectMap);
    for (const p of previousData.projects) if (!all.has(p.id)) all.set(p.id, p);
    return { days: before.days, sessions: hideSessions(previousData.sessions, all, state.filter) };
  }, [previousData, projectMap, before.days, state.filter]);
  const setFilter = useCallback((filter: Filter) => update({ filter }), [update]);

  // Step to the previous/next block in time order (j / k and the drawer's ↑ ↓). Doesn't push
  // history, so the back button isn't stuck walking through every step.
  // While filtering, only matching blocks are visited
  const ordered = useMemo(() => orderedBlocks(focused, from, to), [focused, from, to]);
  const currentAt = selectedSegment(visible, state.session, state.at)?.start ?? state.at;
  const current = state.session && currentAt !== null ? { id: state.session, at: currentAt } : null;
  const prev = stepBlock(ordered, current, -1);
  const next = stepBlock(ordered, current, 1);
  const goTo = useCallback(
    (b: { id: string; at: number } | null) => b && update({ session: b.id, at: b.at }),
    [update],
  );

  // On close, return focus to the block (row) that was open, so keyboard navigation can continue
  const closeDrawer = useCallback(() => {
    const el = document.querySelector<HTMLElement>(
      "main button[data-selected], main tr[data-selected] button, main li[data-selected] button",
    );
    update({ session: null, at: null });
    el?.focus({ preventScroll: true });
  }, [update]);

  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ← → previous/next period, t today, w / d week/day, c / s calendar/summary, l the summary's table, j / k next/previous
  // block, / search, Esc close details, ? the "⋯" menu. The list shown to users is SHORTCUTS in
  // Toolbar.tsx. Inside the date picker (data-date-picker) arrow keys move between days, so skip them here
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target?.closest("input, textarea, [contenteditable], [data-date-picker]")
      )
        return;
      if (e.key === "ArrowLeft") update({ anchor: shift(state.view, state.anchor, -1) });
      else if (e.key === "ArrowRight") update({ anchor: shift(state.view, state.anchor, 1) });
      else if (e.key === "t") update({ anchor: startOfDay(Date.now()) });
      else if (e.key === "w") update({ view: "week" });
      else if (e.key === "d") update({ view: "day" });
      else if (e.key === "c") update({ layout: "calendar" });
      else if (e.key === "l") update({ layout: "list" });
      else if (e.key === "s") update({ layout: "summary" });
      else if (e.key === "j") goTo(next ?? null);
      else if (e.key === "k") goTo(prev ?? null);
      // On some keyboard layouts Shift+/ still arrives as "/", so accept both
      else if (e.key === "?" || (e.key === "/" && e.shiftKey)) setMenuOpen((v) => !v);
      else if (e.key === "/") searchRef.current?.focus();
      // While a popover (list, projects) is open, Esc only closes it (tooltips don't count).
      // At this point Radix hasn't closed it yet, so its content is still in the DOM
      else if (
        e.key === "Escape" &&
        state.session &&
        !document.querySelector("[data-slot=popover-content]")
      )
        closeDrawer();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [state.view, state.anchor, state.session, update, goTo, prev, next, closeDrawer]);

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
        report={() => buildReport(days, focused, projectMap)}
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
      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          {state.layout !== "calendar" && (
            <SummaryTabs
              table={state.layout === "list"}
              onTable={(table) => update({ layout: table ? "list" : "summary" })}
            />
          )}
          {state.layout === "list" ? (
            <SessionList {...body} sort={state.sort} onSort={(sort) => update({ sort })} />
          ) : state.layout === "summary" ? (
            <SummaryView
              {...body}
              view={state.view}
              from={from}
              to={to}
              previous={previousSessions}
            />
          ) : (
            <CalendarGrid {...body} />
          )}
          {calendar.isError && <Notice>{m.disconnected(<code>kairos ensure</code>)}</Notice>}
          {calendar.isSuccess && visible.length === 0 && (
            <EmptyNotice
              period={period}
              progress={progress}
              hiddenBy={
                sessions.length === 0
                  ? null
                  : hideSessions(sessions, projectMap, NO_FILTER).length === 0
                    ? "project"
                    : "brief"
              }
              prev={calendar.data.prev}
              next={calendar.data.next}
              onJump={(t) => update({ anchor: startOfDay(t) })}
            />
          )}
          {visible.length > 0 && focused.length === 0 && isFocused(state.filter) && (
            <Notice>
              <p>{m.noMatch(period)}</p>
              <Button
                variant="outline"
                size="xs"
                className="mt-2"
                onClick={() => setFilter({ ...state.filter, q: "", outcome: false })}
              >
                {m.clearFilter}
              </Button>
            </Notice>
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

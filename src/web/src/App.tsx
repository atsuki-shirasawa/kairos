import { startOfDay } from "@shared/dates.ts";
import { useCallback, useRef, useState } from "react";
import { LayoutBody } from "@/components/app/LayoutBody.tsx";
import { PeriodNotices } from "@/components/app/Notices.tsx";
import { FilterChips } from "@/components/filter/FilterChips.tsx";
import { SessionDrawer } from "@/components/SessionDrawer.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { useSummaryLangSync } from "@/hooks/queries.ts";
import { useBlockStepping, useCloseDrawer } from "@/hooks/useBlockNavigation.ts";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.ts";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { useLiveSummary } from "@/hooks/useLiveSummary.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import { usePeriodData } from "@/hooks/usePeriodData.ts";
import { useTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { useLocale } from "@/i18n/index.ts";
import { shift } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import { buildReport } from "@/lib/report.ts";

/**
 * Root component: owns the URL-synced view state and wires the toolbar, the layout's body
 * (the home page, calendar, summary, table or the live page) and the session drawer together, plus the global
 * shortcuts.
 */
export function App() {
  const [theme, setTheme] = useTheme();
  const [state, update] = useUrlState();
  const now = useNow();
  useSummaryLangSync(useLocale());
  const progress = useLiveUpdates();
  const data = usePeriodData(state);
  const { from, to, days, projectMap, visible, focused, search } = data;
  const setFilter = useCallback((filter: Filter) => update({ filter }), [update]);
  const live = useLiveSummary(projectMap, now);
  useDocumentTitle(live.summary.attention);

  const { prev, next, goTo, run } = useBlockStepping({
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
  const [searchPanel, setSearchPanel] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts({
    state,
    update,
    prev,
    next,
    goTo,
    run,
    closeDrawer,
    toggleMenu: () => setMenuOpen((v) => !v),
    focusSearch: () => searchRef.current?.focus(),
  });

  const layout = LAYOUTS[state.layout];
  const { stepping } = layout;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        layout={state.layout}
        onLayout={(layout) => update({ layout })}
        now={now}
        projects={data.projects}
        projectMap={projectMap}
        progress={progress}
        live={live.summary}
        period={{
          view: state.view,
          anchor: state.anchor,
          onView: (view) => update({ view }),
          onMove: (dir) => update({ anchor: shift(state.view, state.anchor, dir) }),
          onToday: () => update({ anchor: startOfDay(Date.now()) }),
          onJump: (day) => update({ anchor: day }),
        }}
        filter={{ value: state.filter, onChange: setFilter, sessions: data.sessions }}
        search={{
          ref: searchRef,
          results: {
            hits: search.data?.hits ?? [],
            more: search.data?.more ?? false,
            loading: search.isFetching,
            error: search.error?.message ?? null,
          },
          onOpenHit: (hit) =>
            update(
              { anchor: startOfDay(hit.start), session: hit.sessionId, at: hit.start },
              { push: true },
            ),
          onPanel: setSearchPanel,
        }}
        report={{
          // The report follows what's on screen: hidden projects and filters apply
          build: () => buildReport(days, focused, projectMap, data.recapBodies),
          hasWork: focused.length > 0,
        }}
        menu={{ open: menuOpen, onOpenChange: setMenuOpen, theme, onTheme: setTheme }}
      />
      {layout.hasPeriod && <FilterChips filter={state.filter} onFilter={setFilter} />}
      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <LayoutBody state={state} update={update} data={data} live={live} now={now} />
          <PeriodNotices
            state={state}
            data={data}
            progress={progress}
            searchPanel={searchPanel}
            update={update}
            onFilter={setFilter}
          />
        </main>
        {state.session && (
          <SessionDrawer
            id={state.session}
            at={state.at}
            onClose={closeDrawer}
            onSelect={(session, at) => update({ session, at }, { push: true })}
            onPrev={prev && stepping.blocks ? () => goTo(prev) : null}
            onNext={next && stepping.blocks ? () => goTo(next) : null}
            run={stepping.runs ? run : null}
            onRun={goTo}
            overlay={layout.drawerOverlay(state.view)}
          />
        )}
      </div>
    </div>
  );
}

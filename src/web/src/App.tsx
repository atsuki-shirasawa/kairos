import type { SearchHit } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { useCallback, useRef, useState } from "react";
import { LayoutBody } from "@/components/app/LayoutBody.tsx";
import { PeriodNotices } from "@/components/app/Notices.tsx";
import { FilterChips } from "@/components/filter/FilterChips.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { SessionDrawer } from "@/features/drawer/SessionDrawer.tsx";
import { PaletteHost } from "@/features/palette/PaletteHost.tsx";
import { useSummaryLangSync } from "@/hooks/queries.ts";
import { useBlockStepping, useCloseDrawer } from "@/hooks/useBlockNavigation.ts";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.ts";
import { useJournalTab } from "@/hooks/useJournalTab.ts";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { useLiveSummary } from "@/hooks/useLiveSummary.ts";
import { useLiveUpdates } from "@/hooks/useLiveUpdates.ts";
import { useNow } from "@/hooks/useNow.ts";
import { usePeriodData } from "@/hooks/usePeriodData.ts";
import { usePinnedDetail } from "@/hooks/usePinnedDetail.ts";
import { useTheme } from "@/hooks/useTheme.ts";
import { useUrlState } from "@/hooks/useUrlState.ts";
import { useLocale } from "@/i18n/index.ts";
import { shift } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import type { ShortcutTargets } from "@/lib/shortcutActions.ts";

/**
 * Root component: owns the URL-synced view state and wires the toolbar, the layout's body
 * (Today, or the Journal's calendar, Insights or table) and the session drawer together, plus the global
 * shortcuts.
 */
export function App() {
  const [theme, setTheme] = useTheme();
  const [state, update] = useUrlState();
  const now = useNow();
  useSummaryLangSync(useLocale());
  const progress = useLiveUpdates();
  const data = usePeriodData(state);
  const { from, to, projectMap, visible, focused, search } = data;
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
  const layout = LAYOUTS[state.layout];
  const pinned = usePinnedDetail({
    pinned: layout.drawerPinned(state.view),
    ready: data.loaded && !data.calendar.isPlaceholderData,
    focused,
    visible,
    from,
    to,
    session: state.session,
    at: state.at,
    update,
  });
  // The pinned pane has no close, so Esc isn't the drawer's there
  const closeDrawer = useCloseDrawer(update);
  const onClose = pinned ? null : closeDrawer;

  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchPanel, setSearchPanel] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const keys: ShortcutTargets = {
    state,
    update,
    now,
    prev,
    next,
    goTo,
    run,
    closeDrawer: onClose,
    toggleMenu: () => setMenuOpen((v) => !v),
    focusSearch: () => searchRef.current?.focus(),
    togglePalette: () => setPaletteOpen((v) => !v),
  };
  useKeyboardShortcuts(keys);
  const openHit = (hit: SearchHit) =>
    update(
      { anchor: startOfDay(hit.start), session: hit.sessionId, at: hit.start },
      { push: true },
    );
  // The page's own period follows what's on screen: hidden projects and filters apply
  const shown = layout.hasPeriod
    ? { view: state.view, from, to, sessions: data.loaded ? focused : null }
    : null;

  const journalTab = useJournalTab(state.layout);
  const { stepping } = layout;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        layout={state.layout}
        onLayout={(layout) => update({ layout })}
        journalTab={journalTab}
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
        filter={{
          value: state.filter,
          onChange: setFilter,
          sessions: data.sessions,
          open: filtersOpen,
          onOpenChange: setFiltersOpen,
        }}
        search={{
          ref: searchRef,
          results: {
            hits: search.data?.hits ?? [],
            more: search.data?.more ?? false,
            loading: search.isFetching,
            error: search.error?.message ?? null,
          },
          onOpenHit: openHit,
          onPanel: setSearchPanel,
        }}
        report={{ ready: data.projectsKnown, shown }}
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
            onClose={onClose}
            onSelect={(session, at) => update({ session, at }, { push: true })}
            onPrev={prev && stepping.blocks ? () => goTo(prev) : null}
            onNext={next && stepping.blocks ? () => goTo(next) : null}
            run={stepping.runs ? run : null}
            onRun={goTo}
            overlay={layout.drawerOverlay(state.view)}
          />
        )}
      </div>
      <PaletteHost
        dialog={{ open: paletteOpen, onOpenChange: setPaletteOpen }}
        keys={keys}
        projects={{ list: data.projects, byId: projectMap, ready: data.projectsKnown }}
        shown={shown}
        filter={{ value: state.filter, onChange: setFilter, open: () => setFiltersOpen(true) }}
        theme={{ value: theme, onChange: setTheme }}
        onOpenHit={openHit}
      />
    </div>
  );
}

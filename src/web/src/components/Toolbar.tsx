import type { CalendarSession, Project, SearchHit } from "@shared/api.ts";
import type { ImportProgress } from "@/hooks/useLiveUpdates.ts";
import type { Theme } from "@/hooks/useTheme.ts";
import type { Filter } from "@/lib/filter.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import type { Layout, View } from "@/lib/view.ts";
import { DatePicker } from "./DatePicker.tsx";
import { FilterMenu } from "./FilterMenu.tsx";
import { SearchField, type SearchState } from "./SearchField.tsx";
import { AppMenu } from "./toolbar/AppMenu.tsx";
import { Brand } from "./toolbar/Brand.tsx";
import { LiveButton, type LiveSummary } from "./toolbar/LiveButton.tsx";
import { PeriodNav } from "./toolbar/PeriodNav.tsx";
import { type ShownPeriod, StandupMenu } from "./toolbar/StandupMenu.tsx";
import { LayoutToggle, ViewToggle } from "./toolbar/ViewToggles.tsx";

/** The shown period and how to move through it or pick another. */
export interface ToolbarPeriod {
  view: View;
  anchor: number;
  onView: (view: View) => void;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
  onJump: (day: number) => void;
}

/** The filter and the period's sessions, which the filter menu offers conditions from. */
export interface ToolbarFilter {
  value: Filter;
  onChange: (filter: Filter) => void;
  sessions: CalendarSession[];
}

/** The search field and its results across every period. */
export interface ToolbarSearch {
  /** App holds the ref because the `/` key focuses it. */
  ref: React.RefObject<HTMLInputElement | null>;
  /** Results of the keyword across every period. */
  results: SearchState;
  onOpenHit: (hit: SearchHit) => void;
  /** Whether the search results panel is open (it covers the top of the period body). */
  onPanel: (open: boolean) => void;
}

/** The standup menu: besides its fixed periods, the page's own period as shown. */
export interface ToolbarReport {
  /** Whether the projects are known; until then a report could list hidden work. */
  ready: boolean;
  /** null on a page without a period. */
  shown: ShownPeriod | null;
}

/** The "⋯" menu (theme, language, shortcuts). App owns its open state because `?` opens it too. */
export interface ToolbarMenu {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}

interface Props {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  now: number;
  projects: Project[];
  projectMap: Map<number, Project>;
  progress: ImportProgress;
  /** The running sessions, for the button that opens their page. */
  live: LiveSummary;
  period: ToolbarPeriod;
  filter: ToolbarFilter;
  search: ToolbarSearch;
  report: ToolbarReport;
  menu: ToolbarMenu;
}

/**
 * The header bar: wordmark (which leads home), period navigation, view and layout toggles, the
 * Live button (which leads home too), search, filters, report copy and the "⋯" menu. The home page
 * has no period, so there the period controls give way to its heading.
 */
export function Toolbar({
  layout,
  onLayout,
  now,
  projects,
  projectMap,
  progress,
  live,
  period,
  filter,
  search,
  report,
  menu,
}: Props) {
  const { view } = period;
  const { hasPeriod, lit, heading } = LAYOUTS[layout];
  return (
    // Below lg (a half-screen or small laptop window; the full bar needs ~940px with a two-month
    // week label) the bar tightens instead of overflowing: the wordmark goes and search shrinks to
    // its icon, but every control stays. Groups are set apart by spacing, not rules
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-5 max-lg:gap-2 max-lg:px-3">
      <Brand progress={progress} onHome={() => onLayout("today")} />
      <span className="w-3 shrink-0 max-lg:hidden" aria-hidden />
      {/* The home page shows the present, so it has no period to move through or pick */}
      {!hasPeriod ? (
        <h1 className="min-w-0 truncate font-semibold text-title tracking-tight">{heading?.()}</h1>
      ) : (
        <>
          <PeriodNav view={view} onMove={period.onMove} onToday={period.onToday} />
          <h1 className="flex min-w-0">
            <DatePicker
              view={view}
              anchor={period.anchor}
              now={now}
              projects={projectMap}
              onJump={period.onJump}
            />
          </h1>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 max-lg:gap-1">
        {/* Search narrows the shown period, which the home page doesn't have */}
        {hasPeriod && (
          <SearchField
            inputRef={search.ref}
            value={filter.value.q}
            files={filter.value.qFiles}
            onFiles={(qFiles) => filter.onChange({ ...filter.value, qFiles })}
            period={view}
            onChange={(q) => filter.onChange({ ...filter.value, q })}
            search={search.results}
            projects={projectMap}
            onOpen={search.onOpenHit}
            onPanel={search.onPanel}
          />
        )}
        {hasPeriod && <ViewToggle view={view} onView={period.onView} />}
        <LayoutToggle lit={lit} onLayout={onLayout} />
        <LiveButton live={live} active={lit === "today"} onOpen={() => onLayout("today")} />
        <span className="w-2 shrink-0 max-lg:hidden" aria-hidden />
        <StandupMenu now={now} projects={projectMap} {...report} />
        {hasPeriod && (
          <>
            <FilterMenu
              projects={projects}
              projectMap={projectMap}
              sessions={filter.sessions}
              filter={filter.value}
              onFilter={filter.onChange}
            />
          </>
        )}
        <AppMenu
          open={menu.open}
          onOpenChange={menu.onOpenChange}
          theme={menu.theme}
          onTheme={menu.onTheme}
        />
      </div>
    </header>
  );
}

import type { CalendarSession, Project, SearchHit } from "@shared/api.ts";
import type { Theme } from "@/hooks/useTheme.ts";
import type { Layout, View } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { DatePicker } from "./DatePicker.tsx";
import { FilterMenu } from "./FilterMenu.tsx";
import { SearchField, type SearchState } from "./SearchField.tsx";
import { AppMenu } from "./toolbar/AppMenu.tsx";
import { Brand, type ImportProgress } from "./toolbar/Brand.tsx";
import { CopyReportButton } from "./toolbar/CopyReportButton.tsx";
import { PeriodNav } from "./toolbar/PeriodNav.tsx";
import { LayoutToggle, ViewToggle } from "./toolbar/ViewToggles.tsx";

// SummaryView styles its own toggles with the toolbar's segmented look
export { SEGMENT, SEGMENTED } from "./toolbar/segmented.ts";

interface Props {
  view: View;
  layout: Layout;
  anchor: number;
  now: number;
  projects: Project[];
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  progress: ImportProgress;
  onView: (view: View) => void;
  onLayout: (layout: Layout) => void;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
  onJump: (day: number) => void;
  /** The search field. App holds the ref because the `/` key focuses it. */
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** Results of the keyword across every period. */
  search: SearchState;
  projectMap: Map<number, Project>;
  onOpenHit: (hit: SearchHit) => void;
  /** Whether the search results panel is open (it covers the top of the period body). */
  onSearchPanel: (open: boolean) => void;
  /** The shown work as Markdown (empty when there is none). Built only when copying. */
  report: () => string;
  hasWork: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  /** The "⋯" menu (theme, language, shortcuts). App owns its open state because `?` opens it too. */
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}

/**
 * The header bar: wordmark, period navigation, view and layout toggles, search, filters,
 * report copy and the "⋯" menu.
 */
export function Toolbar({
  view,
  layout,
  anchor,
  now,
  projects,
  sessions,
  filter,
  onFilter,
  progress,
  onView,
  onLayout,
  onMove,
  onToday,
  onJump,
  searchRef,
  search,
  projectMap,
  onOpenHit,
  onSearchPanel,
  report,
  hasWork,
  theme,
  onTheme,
  menuOpen,
  onMenuOpen,
}: Props) {
  return (
    // Below md (a half-screen window) the bar tightens instead of overflowing: the wordmark goes
    // and search shrinks to its icon, but every control stays. Groups are set apart by spacing,
    // not rules
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-5 max-md:gap-2 max-md:px-3">
      <Brand progress={progress} />
      <span className="w-3 shrink-0 max-md:hidden" aria-hidden />
      <PeriodNav view={view} onMove={onMove} onToday={onToday} />
      <h1 className="flex min-w-0">
        <DatePicker view={view} anchor={anchor} now={now} projects={projects} onJump={onJump} />
      </h1>

      <div className="ml-auto flex shrink-0 items-center gap-2 max-md:gap-1">
        <SearchField
          inputRef={searchRef}
          value={filter.q}
          files={filter.qFiles}
          onFiles={(qFiles) => onFilter({ ...filter, qFiles })}
          period={view}
          onChange={(q) => onFilter({ ...filter, q })}
          search={search}
          projects={projectMap}
          onOpen={onOpenHit}
          onPanel={onSearchPanel}
        />
        <ViewToggle view={view} onView={onView} />
        <LayoutToggle layout={layout} onLayout={onLayout} />
        <span className="w-2 shrink-0 max-md:hidden" aria-hidden />
        <CopyReportButton view={view} report={report} hasWork={hasWork} />
        <FilterMenu projects={projects} sessions={sessions} filter={filter} onFilter={onFilter} />
        <AppMenu open={menuOpen} onOpenChange={onMenuOpen} theme={theme} onTheme={onTheme} />
      </div>
    </header>
  );
}

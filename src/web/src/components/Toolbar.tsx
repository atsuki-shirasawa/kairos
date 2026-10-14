import type { CalendarSession, Project, SearchHit } from "@shared/api.ts";
import type { ImportProgress } from "@/hooks/useLiveUpdates.ts";
import type { Theme } from "@/hooks/useTheme.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import type { Layout, View } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { DatePicker } from "./DatePicker.tsx";
import { FilterMenu } from "./FilterMenu.tsx";
import { SearchField, type SearchState } from "./SearchField.tsx";
import { AppMenu } from "./toolbar/AppMenu.tsx";
import { Brand } from "./toolbar/Brand.tsx";
import { CopyReportButton } from "./toolbar/CopyReportButton.tsx";
import { LiveButton, type LiveSummary } from "./toolbar/LiveButton.tsx";
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
  /** The running sessions, for the button that opens their page. */
  live: LiveSummary;
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
 * The header bar: wordmark, period navigation, view and layout toggles, the live page's button,
 * search, filters, report copy and the "⋯" menu. The live page has no period, so there the
 * period controls give way to its heading.
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
  live,
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
    // Below lg (a half-screen or small laptop window; the full bar needs ~940px with a two-month
    // week label) the bar tightens instead of overflowing: the wordmark goes and search shrinks to
    // its icon, but every control stays. Groups are set apart by spacing, not rules
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-5 max-lg:gap-2 max-lg:px-3">
      <Brand progress={progress} />
      <span className="w-3 shrink-0 max-lg:hidden" aria-hidden />
      {/* The live page shows the present, so it has no period to move through or pick */}
      {layout === "live" ? (
        <h1 className="min-w-0 truncate font-semibold text-[17px] tracking-tight">
          {liveMessages().heading}
        </h1>
      ) : (
        <>
          <PeriodNav view={view} onMove={onMove} onToday={onToday} />
          <h1 className="flex min-w-0">
            <DatePicker view={view} anchor={anchor} now={now} projects={projects} onJump={onJump} />
          </h1>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 max-lg:gap-1">
        {/* Search narrows the shown period, which the live page doesn't have */}
        {layout !== "live" && (
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
        )}
        {layout !== "live" && <ViewToggle view={view} onView={onView} />}
        <LayoutToggle layout={layout} onLayout={onLayout} />
        <LiveButton live={live} active={layout === "live"} onOpen={() => onLayout("live")} />
        <span className="w-2 shrink-0 max-lg:hidden" aria-hidden />
        {layout !== "live" && (
          <>
            <CopyReportButton view={view} report={report} hasWork={hasWork} />
            <FilterMenu
              projects={projects}
              sessions={sessions}
              filter={filter}
              onFilter={onFilter}
            />
          </>
        )}
        <AppMenu open={menuOpen} onOpenChange={onMenuOpen} theme={theme} onTheme={onTheme} />
      </div>
    </header>
  );
}

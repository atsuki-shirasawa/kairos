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

/** The copy-report button. */
export interface ToolbarReport {
  /** The shown work as Markdown (empty when there is none). Built only when copying. */
  build: () => string;
  hasWork: boolean;
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
 * The header bar: wordmark, period navigation, view and layout toggles, the live page's button,
 * search, filters, report copy and the "⋯" menu. The live page has no period, so there the
 * period controls give way to its heading.
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
          <PeriodNav view={view} onMove={period.onMove} onToday={period.onToday} />
          <h1 className="flex min-w-0">
            <DatePicker
              view={view}
              anchor={period.anchor}
              now={now}
              projects={projects}
              onJump={period.onJump}
            />
          </h1>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2 max-lg:gap-1">
        {/* Search narrows the shown period, which the live page doesn't have */}
        {layout !== "live" && (
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
        {layout !== "live" && <ViewToggle view={view} onView={period.onView} />}
        <LayoutToggle layout={layout} onLayout={onLayout} />
        <LiveButton live={live} active={layout === "live"} onOpen={() => onLayout("live")} />
        <span className="w-2 shrink-0 max-lg:hidden" aria-hidden />
        {layout !== "live" && (
          <>
            <CopyReportButton view={view} report={report.build} hasWork={report.hasWork} />
            <FilterMenu
              projects={projects}
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

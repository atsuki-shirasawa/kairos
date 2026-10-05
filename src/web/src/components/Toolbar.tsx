import type { CalendarSession, Project, SearchHit } from "@shared/api.ts";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Ellipsis,
  List,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useCopy } from "@/hooks/useCopy.ts";
import type { Theme } from "@/hooks/useTheme.ts";
import { LOCALES, type Locale, setLocale, useLocale } from "@/i18n/index.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import type { Layout, View } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { cn } from "@/lib/utils.ts";
import { DatePicker } from "./DatePicker.tsx";
import { FilterMenu } from "./FilterMenu.tsx";
import { SearchField, type SearchState } from "./SearchField.tsx";

interface Props {
  view: View;
  layout: Layout;
  anchor: number;
  now: number;
  projects: Project[];
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  progress: { done: number; total: number } | null;
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
  /** The shown work as Markdown (empty when there is none). Built only when copying. */
  report: () => string;
  hasWork: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  /** The "⋯" menu (theme, language, shortcuts). App owns its open state because `?` opens it too. */
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}

/** Segmented toggle look: only the selected item rises off the track (iOS / macOS style). */
const SEGMENTED = "rounded-lg bg-muted p-0.5";
const SEGMENT =
  "h-7 rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

function themes(): [Theme, string, typeof Sun][] {
  const m = toolbarMessages();
  return [
    ["system", m.themeSystem, Monitor],
    ["light", m.themeLight, Sun],
    ["dark", m.themeDark, Moon],
  ];
}

/** Each language's name is written in that language, so it can be found from either side. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", ja: "日本語" };

/** The keyboard shortcuts. The keys are handled in App.tsx's keydown listener. */
function shortcuts(): [string[], string][] {
  const m = toolbarMessages();
  return [
    [["←", "→"], m.shortcutPeriod],
    [["t"], m.shortcutToday],
    [["w", "d"], m.shortcutView],
    [["c", "l"], m.shortcutLayout],
    [["j", "k"], m.shortcutStep],
    [["/"], m.shortcutSearch],
    [["Esc"], m.shortcutClose],
    [["?"], m.shortcutMenu],
  ];
}

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
  report,
  hasWork,
  theme,
  onTheme,
  menuOpen,
  onMenuOpen,
}: Props) {
  const m = toolbarMessages();
  const locale = useLocale();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <span className="flex shrink-0 items-center gap-2">
        <Logo progress={progress} />
        <span className="font-semibold text-[15px] tracking-wide">Kairos</span>
      </span>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

      {/* Navigation buttons form one group left of the heading (the usual calendar-app layout) */}
      <div className="flex shrink-0 items-center rounded-md border bg-card">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-r-none"
          onClick={() => onMove(-1)}
          aria-label={m.prev(view)}
          title={`${m.prev(view)} (←)`}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none border-x px-3"
          onClick={onToday}
          title={`${m.today} (t)`}
        >
          {m.today}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-l-none"
          onClick={() => onMove(1)}
          aria-label={m.next(view)}
          title={`${m.next(view)} (→)`}
        >
          <ChevronRight />
        </Button>
      </div>

      <h1 className="flex min-w-0">
        <DatePicker view={view} anchor={anchor} now={now} projects={projects} onJump={onJump} />
      </h1>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SearchField
          inputRef={searchRef}
          value={filter.q}
          period={view}
          onChange={(q) => onFilter({ ...filter, q })}
          search={search}
          projects={projectMap}
          onOpen={onOpenHit}
        />
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0.5}
          className={SEGMENTED}
          value={view}
          onValueChange={(v) => v && onView(v as View)}
          aria-label={m.viewToggle}
        >
          <ToggleGroupItem value="week" className={SEGMENT} title={m.weekTitle}>
            {m.week}
          </ToggleGroupItem>
          <ToggleGroupItem value="day" className={SEGMENT} title={m.dayTitle}>
            {m.day}
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0.5}
          className={SEGMENTED}
          value={layout}
          onValueChange={(v) => v && onLayout(v as Layout)}
          aria-label={m.layoutToggle}
        >
          <ToggleGroupItem
            value="calendar"
            className={SEGMENT}
            aria-label={m.calendar}
            title={`${m.calendar} (c)`}
          >
            <CalendarDays />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="list"
            className={SEGMENT}
            aria-label={m.list}
            title={`${m.list} (l)`}
          >
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <CopyReportButton view={view} report={report} hasWork={hasWork} />
        <FilterMenu projects={projects} sessions={sessions} filter={filter} onFilter={onFilter} />
        <Popover open={menuOpen} onOpenChange={onMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={m.menu} title={m.menuTitle}>
              <Ellipsis />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 gap-0 p-0">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <span className="font-medium text-sm">{m.theme}</span>
              <ToggleGroup
                type="single"
                size="sm"
                spacing={0.5}
                className={SEGMENTED}
                value={theme}
                onValueChange={(v) => v && onTheme(v as Theme)}
                aria-label={m.theme}
              >
                {themes().map(([value, label, Icon]) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className={cn(SEGMENT, "px-2")}
                    aria-label={label}
                    title={label}
                  >
                    <Icon />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <span className="font-medium text-sm">{m.language}</span>
              <ToggleGroup
                type="single"
                size="sm"
                spacing={0.5}
                className={SEGMENTED}
                value={locale}
                onValueChange={(v) => v && setLocale(v as Locale)}
                aria-label={m.language}
              >
                {LOCALES.map((value) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    lang={value}
                    className={cn(SEGMENT, "px-2")}
                  >
                    {LANGUAGE_NAMES[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="p-3">
              <p className="mb-2 font-medium text-sm">{m.shortcuts}</p>
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
                {shortcuts().map(([keys, label]) => (
                  <div key={label} className="contents">
                    <dt className="flex gap-1">
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-6 rounded border bg-muted px-1.5 text-center font-num text-xs leading-5"
                        >
                          {k}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

/**
 * Copies the shown period's work as Markdown, for a stand-up note or a weekly report.
 * It follows the filter, so narrowing to one project first copies only that project.
 */
function CopyReportButton({
  view,
  report,
  hasWork,
}: {
  view: View;
  report: () => string;
  hasWork: boolean;
}) {
  const m = toolbarMessages();
  const [state, copy] = useCopy();
  const label = !hasWork
    ? m.nothingToReport(view)
    : state === "copied"
      ? m.copiedReport
      : state === "failed"
        ? formatMessages().copyFailed
        : m.copyReport(view);
  return (
    // A disabled button gets no tooltip, so it stays enabled and does nothing without work
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => hasWork && copy(report())}
      aria-disabled={!hasWork}
      className={cn(!hasWork && "opacity-50")}
      aria-label={label}
      title={label}
    >
      {state === "copied" ? <Check className="text-primary" /> : <ClipboardList />}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}

/**
 * The app mark (`public/favicon.svg`; see "Mark" in docs/design.md).
 * While importing, a progress ring is drawn around it. Text would change the header width and
 * shift the buttons.
 */
function Logo({ progress }: { progress: { done: number; total: number } | null }) {
  const rate = progress ? Math.min(progress.done / Math.max(progress.total, 1), 1) : 0;
  const label = progress ? toolbarMessages().importing(Math.floor(rate * 100)) : undefined;
  // Circumference of radius 9. stroke-dasharray draws only the completed part
  const length = 2 * Math.PI * 9;
  return (
    <span className="relative flex size-5 items-center justify-center" title={label}>
      {/* Screen readers still hear the percentage, as with the old text display */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      {/* Reuse the favicon so the shape and color live in one place. Same color in every theme */}
      <img src="/favicon.svg" className="size-4" alt="" />
      {progress && (
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="9" fill="none" strokeWidth="1.5" className="stroke-border" />
          <circle
            cx="10"
            cy="10"
            r="9"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${rate * length} ${length}`}
            className="stroke-primary transition-[stroke-dasharray] duration-300"
          />
        </svg>
      )}
    </span>
  );
}

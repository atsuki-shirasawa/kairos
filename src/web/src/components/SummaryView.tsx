import type { CalendarSession, Project } from "@shared/api.ts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import type { View } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { ByDay } from "./summary/ByDay.tsx";
import { ByProject } from "./summary/ByProject.tsx";
import { Done } from "./summary/Done.tsx";
import { ThroughDay } from "./summary/ThroughDay.tsx";
import { Totals } from "./summary/Totals.tsx";
import { usePeriodSummaries } from "./summary/usePeriodSummaries.ts";
import { useProjectRecaps } from "./summary/useProjectRecaps.ts";
import { SEGMENT, SEGMENTED } from "./Toolbar.tsx";

interface Props {
  view: View;
  /** The shown period [from, to). Recaps are stored per period. */
  from: number;
  to: number;
  days: number[];
  sessions: CalendarSession[];
  /** The period before, for the change under each number. null while it loads. */
  previous: { days: number[]; sessions: CalendarSession[] } | null;
  projects: Map<number, Project>;
  /** The same filter as the calendar and list, so all three add up the same blocks. */
  matches: SegmentMatch;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
  /** Overview / table switch, placed at the top of the content rather than on a bar of its own. */
  tabs: React.ReactNode;
}

/**
 * The period at a glance: totals with the change from the period before, where the time went
 * (by day or through the day, and by project), and the blocks themselves grouped by project.
 * Blocks open in the drawer like on the calendar.
 */
export function SummaryView({
  view,
  from,
  to,
  days,
  sessions,
  previous,
  projects,
  matches,
  selectedId,
  selectedAt,
  now,
  onSelect,
  onOpenDay,
  tabs,
}: Props) {
  const { summary, before, soFar } = usePeriodSummaries({
    from,
    to,
    days,
    sessions,
    previous,
    matches,
    now,
  });
  const { recaps, onRecap, requestError } = useProjectRecaps(from, to);
  // Keep the tabs when there's nothing to sum up, so the table stays one click away
  if (summary.blocks === 0 && summary.busyMs === 0)
    return <div className="mx-auto w-full max-w-5xl px-6 pt-4">{tabs}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section
        aria-label={summaryMessages().region(view)}
        className="mx-auto flex max-w-5xl flex-col gap-8 px-6 pt-4 pb-16"
      >
        <div className="-mb-2">{tabs}</div>
        <Totals view={view} soFar={soFar} summary={summary} before={before} />
        {view !== "day" ? (
          <ByDay summary={summary} projects={projects} now={now} onOpenDay={onOpenDay} />
        ) : (
          <ThroughDay
            day={days[0] ?? 0}
            summary={summary}
            projects={projects}
            onSelect={onSelect}
          />
        )}
        <ByProject summary={summary} projects={projects} />
        <Done
          view={view}
          summary={summary}
          projects={projects}
          recaps={recaps}
          onRecap={onRecap}
          requestError={requestError}
          selectedId={selectedId}
          selectedAt={selectedAt}
          onSelect={onSelect}
        />
      </section>
    </div>
  );
}

/**
 * Overview or table. The table is the per-block list with sortable numbers; it keeps its own
 * scroll and sticky header, so it replaces the overview rather than sitting inside it. The switch
 * sits in the first line of either, not on a bar of its own under the toolbar.
 */
export function SummaryTabs({
  table,
  onTable,
}: {
  table: boolean;
  onTable: (table: boolean) => void;
}) {
  const m = summaryMessages();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={table ? "table" : "overview"}
      onValueChange={(v) => v && onTable(v === "table")}
      aria-label={m.tabs}
    >
      <ToggleGroupItem value="overview" className={SEGMENT} title={`${m.overview} (s)`}>
        {m.overview}
      </ToggleGroupItem>
      <ToggleGroupItem value="table" className={SEGMENT} title={`${m.table} (l)`}>
        {m.table}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

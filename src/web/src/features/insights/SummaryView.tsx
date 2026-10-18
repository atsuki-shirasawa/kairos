import { SEGMENT, SEGMENTED } from "@/components/segmented.ts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { PreviousPeriod } from "@/hooks/usePeriodSessions.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import type { PeriodBodyProps } from "@/lib/periodBody.ts";
import { keyCap } from "@/lib/shortcuts.ts";
import type { View } from "@/lib/view.ts";
import { ByDay } from "./ByDay.tsx";
import { ByProject } from "./ByProject.tsx";
import { Done } from "./Done.tsx";
import { ThroughDay } from "./ThroughDay.tsx";
import { Totals } from "./Totals.tsx";
import { usePeriodSummaries } from "./usePeriodSummaries.ts";
import { useProjectOpenItems } from "./useProjectOpenItems.ts";
import { useProjectRecaps } from "./useProjectRecaps.ts";

interface Props extends PeriodBodyProps {
  view: View;
  /** The shown period [from, to). Recaps are stored per period. */
  from: number;
  to: number;
  /** The period before, for the change under each number. null while it loads. */
  previous: PreviousPeriod | null;
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
  const open = useProjectOpenItems(from, to, now);
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
          open={open}
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
      <ToggleGroupItem
        value="overview"
        className={SEGMENT}
        title={`${m.overview} (${keyCap(LAYOUTS.summary.shortcut)})`}
      >
        {m.overview}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="table"
        className={SEGMENT}
        title={`${m.table} (${keyCap(LAYOUTS.table.shortcut)})`}
      >
        {m.table}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

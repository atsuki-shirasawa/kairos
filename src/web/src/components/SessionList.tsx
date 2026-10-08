import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import { DEFAULT_SORT, type ListSort } from "@/hooks/useUrlState.ts";
import { isSameDay, type View } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import type { DayBlock } from "@/lib/layout.ts";
import { type DayGroup, dayGroups, nextSort, sortBlocks, visibleSort } from "@/lib/listTable.ts";
import { ColumnPicker } from "./list/ColumnPicker.tsx";
import { COLUMNS, tableMinRem } from "./list/columns.tsx";
import { PeriodSummary } from "./list/PeriodSummary.tsx";
import { DayRow, NoRecordsRow, Row, type RowContext } from "./list/rows.tsx";
import { ColumnWidths, TableHead } from "./list/TableHead.tsx";
import { useColumns } from "./list/useColumns.ts";
import { useListScroll } from "./list/useListScroll.ts";

interface Props {
  /** The shown period's unit, for the summary line ("This month: …"). */
  view: View;
  days: number[];
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  /** Start of the selected section. When null, every row of that session shows as selected. */
  selectedAt: number | null;
  now: number;
  /** Whether a row matches the filter. The table is read through totals and sorting, so non-matching rows are left out. */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
  /** Sort order. Kept in the URL so it survives Back and reloads. */
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  /** The summary's overview / table switch, at the start of the first line. */
  tabs: React.ReactNode;
}

/**
 * Work blocks of the period as a table. Sorted by time, they are grouped by day with daily totals;
 * sorted by another column, the whole period is one table (to find which work was heaviest).
 */
export function SessionList({
  view,
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
  onOpenDay,
  sort: requested,
  onSort: setSort,
  tabs,
}: Props) {
  const [keys, setKeys] = useColumns();
  const columns = useMemo(() => COLUMNS.filter((c) => keys.includes(c.key)), [keys]);
  const sort = visibleSort(requested, keys, DEFAULT_SORT);
  const groups = useMemo(
    () => dayGroups(days, sessions, matches, now),
    [days, sessions, now, matches],
  );
  const all = useMemo(() => groups.flatMap((g) => g.blocks), [groups]);
  const sorted = useMemo(
    () => sortBlocks(all, columns.find((c) => c.key === sort.key)?.sort, sort.desc),
    [all, sort, columns],
  );
  const { scrollRef, theadRef } = useListScroll(days[0] ?? 0, selectedId, selectedAt);

  // With no records at all, skip the empty table and show only the notice (EmptyNotice in App)
  if (all.length === 0) return <div className="min-h-0 flex-1 bg-card px-4 pt-3">{tabs}</div>;

  const rowContext: RowContext = { projects, selectedId, selectedAt, onSelect, columns };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-card">
      <div className="sticky left-0 flex items-start gap-2 pr-2 pl-4">
        <div className="shrink-0 pt-2">{tabs}</div>
        <PeriodSummary
          blocks={all}
          view={view}
          showUsage={keys.includes("tokens") || keys.includes("cost")}
        />
        <div className="ml-auto shrink-0">
          <ColumnPicker keys={keys} onChange={setKeys} />
        </div>
      </div>
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: `${tableMinRem(columns)}rem` }}
      >
        <ColumnWidths columns={columns} />
        <TableHead
          ref={theadRef}
          columns={columns}
          sort={sort}
          onSort={(key) => setSort(nextSort(sort, key))}
        />
        {sort.key === "start" ? (
          <DayBodies groups={groups} now={now} onOpenDay={onOpenDay} rowContext={rowContext} />
        ) : (
          <SortedBody blocks={sorted} rowContext={rowContext} />
        )}
      </table>
    </div>
  );
}

/** Time order: one body per day, a heading row with the day's totals over its blocks. */
function DayBodies({
  groups,
  now,
  onOpenDay,
  rowContext,
}: {
  groups: DayGroup[];
  now: number;
  onOpenDay: (day: number) => void;
  rowContext: RowContext;
}) {
  const span = rowContext.columns.length + 2;
  return groups.map(({ day, blocks }) => (
    <tbody key={day}>
      <DayRow
        day={day}
        columns={rowContext.columns}
        blocks={blocks}
        today={isSameDay(day, now)}
        now={now}
        onOpen={() => onOpenDay(day)}
      />
      {blocks.length === 0 ? (
        <NoRecordsRow span={span} />
      ) : (
        blocks.map((b) => (
          <Row key={`${b.session.id}-${b.segment.start}`} block={b} {...rowContext} />
        ))
      )}
    </tbody>
  ));
}

/** Sorted by a number: the whole period in one body, each row naming its day. */
function SortedBody({ blocks, rowContext }: { blocks: DayBlock[]; rowContext: RowContext }) {
  return (
    <tbody>
      {blocks.map((b) => (
        <Row
          key={`${b.session.id}-${b.segment.start}-${b.dayStart}`}
          block={b}
          withDate
          {...rowContext}
        />
      ))}
    </tbody>
  );
}

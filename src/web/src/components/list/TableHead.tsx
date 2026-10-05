import type { Ref } from "react";
import type { ListSort } from "@/hooks/useUrlState.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import { cn } from "@/lib/utils.ts";
import { Hint } from "../Hint.tsx";
import { type Column, STICKY_TIME, STICKY_WORK, TIME_REM } from "./columns.tsx";
import { SortHeader } from "./SortHeader.tsx";

/** Fixed widths of the time column and the shown number columns; the work column takes the rest. */
export function ColumnWidths({ columns }: { columns: Column[] }) {
  return (
    <colgroup>
      <col style={{ width: `${TIME_REM}rem` }} />
      <col />
      {columns.map((c) => (
        <col key={c.key} style={{ width: `${c.width}rem` }} />
      ))}
    </colgroup>
  );
}

/** The sticky header row. Time and sortable number columns sort the table when clicked. */
export function TableHead({
  ref,
  columns,
  sort,
  onSort,
}: {
  ref: Ref<HTMLTableSectionElement>;
  columns: Column[];
  sort: ListSort;
  onSort: (key: string) => void;
}) {
  const m = listMessages();
  return (
    <thead ref={ref} className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
      <tr className="text-muted-foreground text-xs [--row:var(--card)]">
        <SortHeader
          label={m.time}
          sortKey="start"
          sort={sort}
          onSort={onSort}
          align="left"
          className={STICKY_TIME}
        />
        <th className={cn("px-2 py-2 text-left font-normal", STICKY_WORK)}>{m.work}</th>
        {columns.map((c) => {
          const { label, title } = m.columns[c.key];
          return c.sort ? (
            <SortHeader
              key={c.key}
              label={label}
              sortKey={c.key}
              sort={sort}
              onSort={onSort}
              title={title}
            />
          ) : (
            <th key={c.key} className="px-2 py-2 text-left font-normal">
              <Hint text={title}>{label}</Hint>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

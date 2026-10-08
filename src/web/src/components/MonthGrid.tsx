import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo, useRef } from "react";
import { useElementHeight } from "@/components/calendar/hooks.ts";
import { CELL_HEAD_PX, CELL_LINE_PX, MonthCell } from "@/components/calendar/MonthCell.tsx";
import { monthRowHeights } from "@/lib/calendarGrid.ts";
import { isSameDay, monthWeeks, weekdayHeaders } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { layoutDay, type PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";

/** Below this a week row stops shrinking and the month scrolls, so a day keeps two lines and "+n more". */
const MIN_ROW_PX = CELL_HEAD_PX + 3 * CELL_LINE_PX;
/** A week without work keeps its day numbers and a little air below them. */
const EMPTY_ROW_PX = CELL_HEAD_PX + 8;

interface Props {
  /** The days of the month (midnight). Its weeks are padded with days of the adjacent months. */
  days: number[];
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  /** Whether a block matches the filter. Non-matching ones are faded, as on the week's grid. */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
}

/**
 * The calendar layout for a month: a Sunday-first grid of days, each listing its work in time
 * order. Time of day no longer fits, so a block is a line rather than a card sized to its length;
 * the day view (opened from a date or "+n more") is where the times are.
 */
export function MonthGrid({ days, sessions, now, onOpenDay, ...context }: Props) {
  const month = days[0] ?? now;
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const blocks = useMemo(
    () => new Map<number, PlacedBlock[]>(days.map((d) => [d, layoutDay(sessions, d)])),
    [days, sessions],
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const heightPx = useElementHeight(bodyRef);
  const rows = monthRowHeights(
    weeks.map((week) => week.some((d) => (blocks.get(d)?.length ?? 0) > 0)),
    { heightPx, minBusyPx: MIN_ROW_PX, emptyPx: EMPTY_ROW_PX },
  );
  // Reserve the scrollbar's gutter only while it shows: a reserved but empty gutter leaves the
  // body's rules short of the right edge
  const scrolls = rows.reduce((sum, px) => sum + px, 0) > heightPx + 0.5;
  const inMonth = new Set(days);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div
        className={cn(
          "grid grid-cols-7 overflow-y-hidden border-b",
          scrolls && "[scrollbar-gutter:stable]",
        )}
      >
        {weekdayHeaders().map((name) => (
          <div key={name} className="border-l px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {name}
          </div>
        ))}
      </div>
      <div
        ref={bodyRef}
        className={cn("min-h-0 flex-1 overflow-y-auto", scrolls && "[scrollbar-gutter:stable]")}
      >
        <div
          className="grid grid-cols-7"
          style={{ gridTemplateRows: rows.map((px) => `${px}px`).join(" ") }}
        >
          {weeks.flatMap((week, i) =>
            week.map((day) => (
              <MonthCell
                key={day}
                day={day}
                outside={!inMonth.has(day)}
                today={isSameDay(day, now)}
                blocks={blocks.get(day) ?? []}
                slots={slotsIn(rows[i] ?? 0)}
                onOpenDay={onOpenDay}
                {...context}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
}

/** How many work lines fit below the date line of a row this tall. */
function slotsIn(rowPx: number): number {
  return Math.max(0, Math.floor((rowPx - CELL_HEAD_PX) / CELL_LINE_PX));
}

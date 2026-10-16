import type { Project } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useSpans } from "@/hooks/queries.ts";
import { datePickerMessages } from "@/i18n/messages/datePicker.ts";
import {
  type DayCellState,
  dayCellState,
  type MonthTableContext,
  movedCursor,
} from "@/lib/datePicker.ts";
import {
  addDays,
  addMonths,
  monthWeeks,
  rangeOf,
  rangeTitle,
  startOfMonth,
  weekdayHeaders,
  weekNumber,
} from "@/lib/dates.ts";
import { recordedDays } from "@/lib/dayBlocks.ts";
import { cn } from "@/lib/utils.ts";
import type { View } from "@/lib/view.ts";

/**
 * A date picker that doubles as the period heading. Clicking opens a month calendar and jumps to
 * the chosen day (the month, week or day view is kept). Reaching a distant day in one step beats paging with ← →.
 * Days with sessions get a dot so empty days aren't opened by mistake.
 */
export function DatePicker({
  view,
  anchor,
  now,
  projects,
  onJump,
}: {
  view: View;
  anchor: number;
  now: number;
  /** Projects by id, so a day with only hidden projects' work gets no dot. */
  projects: Map<number, Project>;
  onJump: (day: number) => void;
}) {
  const m = datePickerMessages();
  const { open, setOpen, cursor, setCursor, grid, onOpenChange, onKeyDown } =
    useDatePickerCursor(anchor);
  const range = rangeTitle(view, anchor, now);
  const { from, to } = rangeOf(view, anchor);
  const month = startOfMonth(cursor);
  const weeks = monthWeeks(month);
  const days = weeks.flat();
  const gridFrom = days[0] ?? month;
  const gridTo = addDays(days.at(-1) ?? month, 1);
  const spans = useSpans(gridFrom, gridTo, open);
  const recorded = useMemo(
    () => recordedDays(spans.data?.spans ?? [], monthWeeks(month).flat(), projects),
    [spans.data, projects, month],
  );

  const jump = (day: number) => {
    onJump(day);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-2 flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-accent"
          aria-label={m.triggerLabel(
            [range.title, range.sub, range.year].filter(Boolean).join(" "),
          )}
          title={range.week ? m.isoWeekTitle(range.week.slice(1)) : undefined}
        >
          <span className="truncate font-num font-semibold text-title tracking-tight">
            {range.title}
          </span>
          {range.sub && (
            <span className="shrink-0 whitespace-nowrap text-body text-muted-foreground">
              {range.sub}
            </span>
          )}
          {range.year && (
            <span className="shrink-0 font-num text-body text-muted-foreground">{range.year}</span>
          )}
          <ChevronDown className="size-3.5 shrink-0 self-center text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          grid.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium font-num text-body" aria-live="polite">
            {m.monthHeading(new Date(month).getFullYear(), new Date(month).getMonth())}
          </span>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label={m.prevMonth}
              title={m.prevMonthTitle}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label={m.nextMonth}
              title={m.nextMonthTitle}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <MonthTable
          grid={grid}
          weeks={weeks}
          context={{ month, from, to, cursor, now, recorded }}
          onKeyDown={onKeyDown}
          onJump={jump}
          onFocusDay={setCursor}
        />
        <p className="flex items-center justify-end gap-1.5 text-meta text-muted-foreground">
          <span className="size-1 rounded-full bg-primary" aria-hidden />
          {m.legend}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The picker's open state and keyboard cursor: the day selected with the keyboard, which the shown
 * month follows. Opening puts the cursor back on the anchor, and while open the focus follows it.
 */
function useDatePickerCursor(anchor: number) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(anchor);
  const grid = useRef<HTMLTableElement>(null);

  // Move focus to the day picked with the arrow keys. Right after opening, onOpenAutoFocus handles it
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLElement>(`[data-day="${startOfDay(cursor)}"]`)?.focus();
  }, [cursor, open]);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setCursor(anchor);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = movedCursor(e.key, cursor);
    if (next === null) return;
    setCursor(next);
    e.preventDefault();
  };
  return { open, setOpen, cursor, setCursor, grid, onOpenChange, onKeyDown };
}

/** The month as a table of Sunday-first weeks, each led by its ISO week number. */
function MonthTable({
  grid,
  weeks,
  context,
  onKeyDown,
  onJump,
  onFocusDay,
}: {
  grid: RefObject<HTMLTableElement | null>;
  weeks: number[][];
  context: MonthTableContext;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onJump: (day: number) => void;
  onFocusDay: (day: number) => void;
}) {
  const m = datePickerMessages();
  return (
    // App's key handler ignores data-date-picker, so arrow keys here don't change the period
    <table
      ref={grid}
      data-date-picker
      className="border-separate border-spacing-y-0.5"
      onKeyDown={onKeyDown}
    >
      <thead>
        <tr>
          <th className="w-7 font-normal text-meta text-muted-foreground" title={m.isoWeek}>
            <span className="sr-only">{m.weekNumber}</span>W
          </th>
          {weekdayHeaders().map((d) => (
            <th key={d} className="size-8 font-normal text-label text-muted-foreground">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            <td className="text-center font-num text-meta text-muted-foreground">
              {weekNumber(week[0] ?? context.month)}
            </td>
            {week.map((day, i) => (
              <DayCell
                key={day}
                day={day}
                state={dayCellState(day, i, context)}
                onJump={onJump}
                onFocusDay={onFocusDay}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One day of the month table: a button that jumps to it, with a dot when it has work. */
function DayCell({
  day,
  state: s,
  onJump,
  onFocusDay,
}: {
  day: number;
  state: DayCellState;
  onJump: (day: number) => void;
  onFocusDay: (day: number) => void;
}) {
  const m = datePickerMessages();
  return (
    <td
      className={cn(
        "p-0",
        // The shown period is a band; in week view the whole row becomes one band
        s.inRange && "bg-accent",
        s.bandStart && "rounded-l-md",
        s.bandEnd && "rounded-r-md",
      )}
    >
      <button
        type="button"
        data-day={day}
        tabIndex={s.cursor ? 0 : -1}
        onClick={() => onJump(day)}
        onFocus={() => !s.cursor && onFocusDay(day)}
        className={cn(
          "relative flex size-8 items-center justify-center rounded-md font-num text-body hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring",
          s.outside && "text-muted-foreground/60",
          // Today is marked by color only (no fill, so it stays legible on the band)
          s.today && "font-semibold text-primary",
        )}
        aria-label={m.dayLabel(
          new Date(day).getMonth(),
          new Date(day).getDate(),
          s.recorded,
          s.inRange,
        )}
        aria-current={s.today ? "date" : undefined}
      >
        {new Date(day).getDate()}
        {s.recorded && (
          <span
            className={cn(
              "absolute bottom-1 size-1 rounded-full bg-primary",
              s.outside && "opacity-50",
            )}
            aria-hidden
          />
        )}
      </button>
    </td>
  );
}

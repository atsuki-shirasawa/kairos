import type { Project } from "@shared/api.ts";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useSpans } from "@/hooks/queries.ts";
import { datePickerMessages } from "@/i18n/messages/datePicker.ts";
import {
  addDays,
  addMonths,
  isSameDay,
  monthWeeks,
  rangeOf,
  rangeTitle,
  startOfDay,
  startOfMonth,
  type View,
  weekdayHeaders,
  weekNumber,
} from "@/lib/dates.ts";
import { recordedDays } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";

/** Days moved by the arrow keys. PageUp / PageDown move by a month. */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

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
  projects: Project[];
  onJump: (day: number) => void;
}) {
  const m = datePickerMessages();
  const [open, setOpen] = useState(false);
  // The day selected with the keyboard. The shown month follows it
  const [cursor, setCursor] = useState(anchor);
  const grid = useRef<HTMLTableElement>(null);
  const range = rangeTitle(view, anchor, now);
  const { from, to } = rangeOf(view, anchor);
  const month = startOfMonth(cursor);
  const weeks = monthWeeks(month);
  const days = weeks.flat();
  const gridFrom = days[0] ?? month;
  const gridTo = addDays(days.at(-1) ?? month, 1);
  const spans = useSpans(gridFrom, gridTo, open);
  const recorded = useMemo(() => {
    const hidden = new Set(projects.filter((p) => p.hidden).map((p) => p.id));
    return recordedDays(spans.data?.spans ?? [], monthWeeks(month).flat(), hidden);
  }, [spans.data, projects, month]);

  // Move focus to the day picked with the arrow keys. Right after opening, onOpenAutoFocus handles it
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLElement>(`[data-day="${startOfDay(cursor)}"]`)?.focus();
  }, [cursor, open]);

  const jump = (day: number) => {
    onJump(day);
    setOpen(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = STEPS[e.key];
    if (step !== undefined) setCursor(addDays(cursor, step));
    else if (e.key === "PageUp") setCursor(addMonths(cursor, -1));
    else if (e.key === "PageDown") setCursor(addMonths(cursor, 1));
    else return;
    e.preventDefault();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setCursor(anchor);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="-mx-2 flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-accent"
          aria-label={m.triggerLabel(
            [range.title, range.sub, range.year].filter(Boolean).join(" "),
          )}
          title={range.week ? m.isoWeekTitle(range.week.slice(1)) : undefined}
        >
          <span className="truncate font-num font-semibold text-[17px] tracking-tight">
            {range.title}
          </span>
          {range.sub && <span className="text-muted-foreground text-sm">{range.sub}</span>}
          {range.year && (
            <span className="font-num text-muted-foreground text-sm">{range.year}</span>
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
          <span className="font-medium font-num text-sm" aria-live="polite">
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
        {/* App's key handler ignores data-date-picker, so arrow keys here don't change the period */}
        <table
          ref={grid}
          data-date-picker
          className="border-separate border-spacing-y-0.5"
          onKeyDown={onKeyDown}
        >
          <thead>
            <tr>
              <th className="w-7 font-normal text-[11px] text-muted-foreground" title={m.isoWeek}>
                <span className="sr-only">{m.weekNumber}</span>W
              </th>
              {weekdayHeaders().map((d) => (
                <th key={d} className="size-8 font-normal text-muted-foreground text-xs">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                <td className="text-center font-num text-[11px] text-muted-foreground">
                  {weekNumber(week[0] ?? month)}
                </td>
                {week.map((day, i) => {
                  const inRange = day >= from && day < to;
                  const outside = new Date(day).getMonth() !== new Date(month).getMonth();
                  const hasRecord = recorded.has(day);
                  return (
                    <td
                      key={day}
                      className={cn(
                        "p-0",
                        // The shown period is a band; in week view the whole row becomes one band
                        inRange && "bg-accent",
                        inRange && (i === 0 || day === from) && "rounded-l-md",
                        inRange && (i === 6 || addDays(day, 1) === to) && "rounded-r-md",
                      )}
                    >
                      <button
                        type="button"
                        data-day={day}
                        tabIndex={isSameDay(day, cursor) ? 0 : -1}
                        onClick={() => jump(day)}
                        onFocus={() => !isSameDay(day, cursor) && setCursor(day)}
                        className={cn(
                          "relative flex size-8 items-center justify-center rounded-md font-num text-sm hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring",
                          outside && "text-muted-foreground/60",
                          // Today is marked by color only (no fill, so it stays legible on the band)
                          isSameDay(day, now) && "font-semibold text-primary",
                        )}
                        aria-label={m.dayLabel(
                          new Date(day).getMonth(),
                          new Date(day).getDate(),
                          hasRecord,
                          inRange,
                        )}
                        aria-current={isSameDay(day, now) ? "date" : undefined}
                      >
                        {new Date(day).getDate()}
                        {hasRecord && (
                          <span
                            className={cn(
                              "absolute bottom-1 size-1 rounded-full bg-primary",
                              outside && "opacity-50",
                            )}
                            aria-hidden
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1 rounded-full bg-primary" aria-hidden />
          {m.legend}
        </p>
      </PopoverContent>
    </Popover>
  );
}

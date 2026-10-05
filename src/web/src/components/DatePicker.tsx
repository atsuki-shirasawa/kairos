import type { Project } from "@shared/api.ts";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useSpans } from "@/hooks/queries.ts";
import {
  addDays,
  addMonths,
  isoWeek,
  isSameDay,
  monthWeeks,
  rangeOf,
  rangeTitle,
  startOfDay,
  startOfMonth,
  type View,
} from "@/lib/dates.ts";
import { recordedDays } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

/** 方向キーで動かす日数。ページ単位（PageUp / PageDown）は月で動かす。 */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * 期間の見出しを兼ねた日付ピッカー。押すと月のカレンダーが開き、選んだ日へ移る（週・日の表示はそのまま）。
 * ← → で 1 期間ずつ戻るより、離れた日へ一度で行けるようにする。
 * 記録のある日には点を付け、空の日を開いてしまわないようにする。
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
  const [open, setOpen] = useState(false);
  // キーボードで選んでいる日。表示する月もこれに従う
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

  // 方向キーで選んだ日へフォーカスを移す。開いた直後は onOpenAutoFocus が受け持つ
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
          aria-label={`${[range.title, range.sub, range.year].filter(Boolean).join(" ")}。日付を選んで移る`}
          title={range.week ? `ISO 週番号 第 ${range.week.slice(1)} 週` : undefined}
        >
          <span className="truncate font-num font-semibold text-lg tracking-tight">
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
            {new Date(month).getFullYear()}年{new Date(month).getMonth() + 1}月
          </span>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label="前の月"
              title="前の月（PageUp）"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label="次の月"
              title="次の月（PageDown）"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        {/* data-date-picker の中は App のキー操作の対象外にしてある。方向キーで期間が動かないように */}
        <table
          ref={grid}
          data-date-picker
          className="border-separate border-spacing-y-0.5"
          onKeyDown={onKeyDown}
        >
          <thead>
            <tr>
              <th className="w-7 font-normal text-[10px] text-muted-foreground" title="ISO 週番号">
                <span className="sr-only">週番号</span>W
              </th>
              {WEEKDAYS.map((d) => (
                <th key={d} className="size-8 font-normal text-muted-foreground text-xs">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                <td className="text-center font-num text-[10px] text-muted-foreground">
                  {isoWeek(week[0] ?? month)}
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
                        // 表示中の期間は帯で示す。週なら行全体が 1 本の帯になる
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
                          // 今日は色だけで示す（期間の帯と重なっても読めるように、地は塗らない）
                          isSameDay(day, now) && "font-semibold text-primary",
                        )}
                        aria-label={`${new Date(day).getMonth() + 1}月${new Date(day).getDate()}日${hasRecord ? "、記録あり" : ""}${inRange ? "（表示中）" : ""}`}
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
          記録のある日
        </p>
      </PopoverContent>
    </Popover>
  );
}

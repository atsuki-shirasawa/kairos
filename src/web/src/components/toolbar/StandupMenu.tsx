import type { CalendarSession, Project } from "@shared/api.ts";
import { Ban, Check, ChevronDown, ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { type CopyState, useCopy } from "@/hooks/useCopy.ts";
import { useLastWorkdayDay } from "@/hooks/useLastWorkday.ts";
import { useReportText } from "@/hooks/useReportText.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { dateLabel, type Range } from "@/lib/dates.ts";
import { STANDUP_PERIODS, type StandupPeriod, standupRange } from "@/lib/report.ts";
import { WORKDAY_LOOKBACK_DAYS } from "@/lib/today.ts";
import { cn } from "@/lib/utils.ts";
import type { View } from "@/lib/view.ts";

/** The page's own period, which the menu offers too: its work as shown, filters applied. */
export interface ShownPeriod extends Range {
  view: View;
  /** As shown, filtered; null while the period loads. */
  sessions: CalendarSession[] | null;
}

/**
 * "Standup ▾": copies a work report as Markdown from any page, for the last workday, today or
 * this week, and on a page with a period, that period as shown. The report is fetched on click;
 * the button says how the copy went.
 */
export function StandupMenu({
  now,
  projects,
  ready,
  shown,
}: {
  now: number;
  projects: ReadonlyMap<number, Project>;
  /** Whether the projects are known; the periods wait until they are, not to copy hidden work. */
  ready: boolean;
  /** null on a page without a period (Today, Live). */
  shown: ShownPeriod | null;
}) {
  const m = toolbarMessages();
  const [open, setOpen] = useState(false);
  const [state, copy] = useCopy();
  const build = useReportText(projects);
  const workday = useLastWorkdayDay(now, projects, open && ready);
  const pick = (range: Range, sessions?: CalendarSession[]) => {
    setOpen(false);
    copy(build(range, sessions));
  };
  const label = statusLabel(state);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* The status shows in the icon and the tooltip; a longer word would shift the toolbar */}
        <Button variant="ghost" size="sm" title={label ?? m.standupTitle} aria-label={m.standup}>
          <StatusIcon state={state} />
          <span className="max-xl:hidden">{m.standup}</span>
          <ChevronDown aria-hidden />
          <span className="sr-only" aria-live="polite">
            {label ?? ""}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-0 p-1">
        <ul aria-label={m.standupPeriods} className="flex flex-col">
          {STANDUP_PERIODS.map((period) => {
            const range = ready ? standupRange(period, now, workday ?? null) : null;
            return (
              <PeriodItem
                key={period}
                label={periodLabel(period)}
                note={periodNote(period, workday, now)}
                numeric={period === "lastWorkday" && typeof workday === "number"}
                onPick={range ? () => pick(range) : null}
              />
            );
          })}
          {shown && (
            <PeriodItem
              label={m.standupShown(shown.view)}
              note={m.standupShownNote}
              separated
              onPick={shown.sessions ? () => pick(shown, shown.sessions ?? undefined) : null}
            />
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** One period in the menu, with a note at its right; without `onPick` it can't be copied yet. */
function PeriodItem({
  label,
  note,
  numeric = false,
  separated = false,
  onPick,
}: {
  label: string;
  note: string | null;
  /** The note is a date, set in the numeral face. */
  numeric?: boolean;
  /** Set apart from the periods above (the page's own period). */
  separated?: boolean;
  onPick: (() => void) | null;
}) {
  return (
    <li className={separated ? "mt-1 border-t pt-1" : undefined}>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between"
        disabled={!onPick}
        onClick={onPick ?? undefined}
      >
        <span>{label}</span>
        {note && (
          <span className={cn("text-label text-muted-foreground", numeric && "font-num")}>
            {note}
          </span>
        )}
      </Button>
    </li>
  );
}

/** A standup period's name in the menu. */
function periodLabel(period: StandupPeriod): string {
  const m = toolbarMessages();
  const labels: Record<StandupPeriod, string> = {
    lastWorkday: m.standupLastWorkday,
    today: m.today,
    week: m.standupWeek,
  };
  return labels[period];
}

/** Which day the last workday is, or that there is none; nothing for the other periods. */
function periodNote(
  period: StandupPeriod,
  workday: number | null | undefined,
  now: number,
): string | null {
  if (period !== "lastWorkday" || workday === undefined) return null;
  return workday === null
    ? toolbarMessages().standupNoWorkday(WORKDAY_LOOKBACK_DAYS)
    : dateLabel(workday, now);
}

/** What the button says for a moment after a copy; null when there is nothing to report. */
function statusLabel(state: CopyState): string | null {
  const m = toolbarMessages();
  switch (state) {
    case "idle":
      return null;
    case "copied":
      return m.copiedReport;
    case "empty":
      return m.nothingToReport;
    case "failed":
      return formatMessages().copyFailed;
  }
}

/** The button's icon: a `primary` check once copied, a struck circle when there was nothing. */
function StatusIcon({ state }: { state: CopyState }) {
  if (state === "copied") return <Check className="text-primary" />;
  if (state === "empty") return <Ban />;
  return <ClipboardCopy />;
}

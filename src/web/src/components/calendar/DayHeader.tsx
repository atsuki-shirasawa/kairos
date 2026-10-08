import type { Activity, Usage } from "@shared/api.ts";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { dateMessages } from "@/i18n/messages/dates.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { dateLabel, durationLabel, weekday } from "@/lib/dates.ts";
import { costLabel, tokensLabel, troubleCount } from "@/lib/format.ts";
import { busyMs, type PlacedBlock } from "@/lib/layout.ts";
import { counted, totalsOf } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";

/** The numbers a day header shows, summed over the day's blocks. */
export interface DayFigures {
  /** Blocks on the day; 0 means nothing to show. */
  shown: number;
  /** Blocks counted on this day (a block spanning midnight counts on its first day only). */
  counted: number;
  busy: number;
  usage: Usage | null;
  activity: Activity | null;
  commits: number;
  prs: number;
  trouble: number;
}

/** Sums the day's blocks into the figures its header (or month cell) shows. */
export function dayFigures(blocks: PlacedBlock[]): DayFigures {
  const { usage, activity } = totalsOf(blocks);
  return {
    shown: blocks.length,
    counted: blocks.filter(counted).length,
    busy: busyMs(blocks),
    usage,
    activity,
    commits: activity?.commits ?? 0,
    prs: activity?.prs ?? 0,
    trouble: activity ? troubleCount(activity) : 0,
  };
}

/** Tokens and cost, with "~" on the cost when some of it couldn't be priced. */
function usageText(usage: Usage): string {
  return calendarMessages().tokensCost(
    tokensLabel(usage.tokens),
    `${usage.unpriced ? "~" : ""}${costLabel(usage.costUsd)}`,
  );
}

/**
 * Day header. Below the date, one line with the day's working time and results (a short form of the
 * list's daily totals). Other numbers (blocks, Claude time, tokens, cost, snags) go to the tooltip so
 * the calendar doesn't fill up with numbers. Narrow columns (e.g. with the drawer open) show only line 1.
 * The day view already names the date in the toolbar, so there it is one line of every figure instead.
 */
export function DayHeader({
  day,
  single,
  blocks,
  today,
  onOpen,
}: {
  day: number;
  single: boolean;
  blocks: PlacedBlock[];
  today: boolean;
  onOpen: () => void;
}) {
  const figures = dayFigures(blocks);
  if (single) return <DayFiguresLine figures={figures} />;

  const button = (
    <button
      type="button"
      onClick={onOpen}
      className="@container flex min-h-14 min-w-0 flex-col justify-center overflow-hidden border-l px-2.5 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={calendarMessages().openDay(dateLabel(day))}
    >
      <DayHeading day={day} today={today} figures={figures} />
    </button>
  );
  if (figures.shown === 0) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <DayTooltip day={day} figures={figures} />
    </Tooltip>
  );
}

/** The day view's header: every figure of the day on one line, without the date. */
function DayFiguresLine({ figures }: { figures: DayFigures }) {
  const { busy, activity, commits, prs, trouble, usage } = figures;
  const f = formatMessages();
  return (
    <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-l px-2.5 py-1.5 font-num text-muted-foreground text-xs">
      {figures.shown > 0 && (
        <>
          {/* Working time leads; the rest is detail */}
          <span className="font-semibold text-foreground text-sm">{durationLabel(busy)}</span>
          <span>{f.blocks(figures.counted)}</span>
          {activity?.claudeMs ? (
            <span>{drawerMessages().claudeShort(durationLabel(activity.claudeMs))}</span>
          ) : null}
          {(commits > 0 || prs > 0) && <span>{f.commitsPrs(commits, prs)}</span>}
          {trouble > 0 && <span className="text-warn">{f.trouble(trouble)}</span>}
          {usage && <span>{usageText(usage)}</span>}
        </>
      )}
    </div>
  );
}

/** Weekday above the day number, then the short figures line when the column has room. */
function DayHeading({ day, today, figures }: { day: number; today: boolean; figures: DayFigures }) {
  const d = new Date(day);
  return (
    <>
      {/* The weekday sits above the number: beside it, "5 月" reads as May in Japanese */}
      <span
        className={cn("text-[11px] leading-4", today ? "text-primary" : "text-muted-foreground")}
      >
        {weekday(day)}
      </span>
      <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <span className="flex shrink-0 items-baseline gap-1">
          {/* Show the month on the 1st only, so a month change mid-week stands out */}
          {d.getDate() === 1 && (
            <span className="font-num text-muted-foreground text-xs">
              {dateMessages().monthShort(d.getMonth())}
            </span>
          )}
          {/* Circle today's number in indigo (the familiar calendar-app mark) */}
          <span
            className={cn(
              "font-num font-semibold text-[17px] leading-7",
              today
                ? "-ml-1 inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
                : "text-foreground",
            )}
          >
            {d.getDate()}
          </span>
        </span>
        {figures.shown > 0 && <DayStats figures={figures} />}
      </span>
    </>
  );
}

/** Working time and results beside the date, shown only when the column is wide enough. */
function DayStats({ figures }: { figures: DayFigures }) {
  const { busy, commits, prs } = figures;
  const f = formatMessages();
  return (
    <span className="@min-[9rem]:flex hidden min-w-0 items-center gap-2 overflow-hidden font-num text-[11px] text-muted-foreground leading-4">
      <span className="text-foreground">{durationLabel(busy)}</span>
      {/* Nodes keep narrow columns short; with room, the words say what the numbers count */}
      {commits > 0 && (
        <span className="inline-flex @min-[20rem]:hidden items-center gap-1">
          <MomentNode pr={false} />
          {commits}
        </span>
      )}
      {prs > 0 && (
        <span className="inline-flex @min-[20rem]:hidden items-center gap-1">
          <MomentNode pr />
          {prs}
        </span>
      )}
      {(commits > 0 || prs > 0) && (
        <span className="@min-[20rem]:inline hidden">{f.commitsPrs(commits, prs)}</span>
      )}
      {/* Only when wide, add the block count. Cost stays in the tooltip */}
      <span className="@min-[20rem]:inline hidden">{f.blocks(figures.counted)}</span>
    </span>
  );
}

/** Every figure of the day, on hovering its header (or its date in the month view). */
export function DayTooltip({ day, figures }: { day: number; figures: DayFigures }) {
  const { busy, activity, usage, commits, prs, trouble } = figures;
  const m = calendarMessages();
  const f = formatMessages();
  return (
    <TooltipContent side="bottom" className="flex-col items-start gap-0.5 font-num">
      <p className="font-medium">{dateLabel(day)}</p>
      <p className="opacity-70">
        {m.blocksWork(f.blocks(figures.counted), durationLabel(busy))}
        {activity?.claudeMs ? m.claudeTotal(durationLabel(activity.claudeMs)) : ""}
      </p>
      {usage && <p className="opacity-70">{usageText(usage)}</p>}
      {(commits > 0 || prs > 0 || trouble > 0) && (
        <p className="opacity-70">
          {f.commitsPrs(commits, prs)}
          {trouble > 0 && `${f.separator}${f.trouble(trouble)}`}
        </p>
      )}
      <p className="opacity-70">{m.clickForDay}</p>
    </TooltipContent>
  );
}

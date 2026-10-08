import type { Project } from "@shared/api.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { scaleToMax, scaleToSum } from "@/lib/charts.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, isSameDay, weekday } from "@/lib/dates.ts";
import type { DaySummary, PeriodSummary } from "@/lib/summary.ts";
import { cn } from "@/lib/utils.ts";
import { Heading, projectName, projectOf } from "./shared.tsx";

/**
 * Above this many days (a month) the bars are too narrow for their durations and weekday ticks:
 * those move to the bar's tooltip, and the ticks keep only the date.
 */
const COMPACT_DAYS = 7;

/** One stacked bar per day. Parallel sessions are split by share, so a bar is the day's union. */
export function ByDay({
  summary,
  projects,
  now,
  onOpenDay,
}: {
  summary: PeriodSummary;
  projects: Map<number, Project>;
  now: number;
  onOpenDay: (day: number) => void;
}) {
  const m = summaryMessages();
  const height = scaleToMax(summary.days.map((d) => d.busyMs));
  const compact = summary.days.length > COMPACT_DAYS;
  const columns = {
    gridTemplateColumns: `repeat(${summary.days.length}, minmax(0, 1fr))`,
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <Heading>{m.byDay}</Heading>
        <Legend summary={summary} projects={projects} />
      </div>
      <div className={cn("grid border-b", compact ? "gap-1" : "gap-2")} style={columns}>
        {summary.days.map((d) => (
          <DayBar
            key={d.day}
            day={d}
            height={height(d.busyMs)}
            compact={compact}
            projects={projects}
            onOpen={() => onOpenDay(d.day)}
          />
        ))}
      </div>
      <div className={cn("mt-1.5 grid", compact ? "gap-1" : "gap-2")} style={columns}>
        {summary.days.map((d) => (
          <span
            key={d.day}
            className={cn(
              "text-center font-num text-xs",
              isSameDay(d.day, now) ? "text-primary" : "text-muted-foreground",
            )}
          >
            {compact
              ? new Date(d.day).getDate()
              : m.dayTick(weekday(d.day), new Date(d.day).getDate())}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Which color is which project, so the bars read without scrolling to the project list. */
function Legend({ summary, projects }: { summary: PeriodSummary; projects: Map<number, Project> }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
      {summary.projects.map((p) => (
        <li key={p.projectId ?? "none"} className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ background: projectColor(projectOf(projects, p.projectId)) }}
            aria-hidden
          />
          {projectName(projects, p.projectId)}
        </li>
      ))}
    </ul>
  );
}

/** A day's bar, `height` percent of the chart, stacked by project. Opens the day when clicked. */
function DayBar({
  day: d,
  height,
  compact,
  projects,
  onOpen,
}: {
  day: DaySummary;
  height: number;
  /** Too narrow for the duration above the bar; the tooltip carries it instead. */
  compact: boolean;
  projects: Map<number, Project>;
  onOpen: () => void;
}) {
  const share = scaleToSum(d.projects.map((p) => p.busyMs));
  const duration = d.busyMs > 0 ? durationLabel(d.busyMs) : summaryMessages().noTime;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={compact ? summaryMessages().dayBarTitle(dateLabel(d.day), duration) : dateLabel(d.day)}
      className={cn(
        "group flex h-40 min-w-0 flex-col items-stretch justify-end gap-1 rounded-t-sm focus-visible:outline-2 focus-visible:outline-ring",
        compact ? "px-0" : "px-1",
      )}
    >
      {!compact && (
        <span className="font-num text-[11px] text-muted-foreground tabular-nums">{duration}</span>
      )}
      <span
        className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm opacity-90 group-hover:opacity-100"
        style={{ height: `${height}%` }}
      >
        {d.projects.map((p) => (
          <span
            key={p.projectId ?? "none"}
            style={{
              height: `${share(p.busyMs)}%`,
              background: projectColor(projectOf(projects, p.projectId)),
            }}
          />
        ))}
      </span>
    </button>
  );
}

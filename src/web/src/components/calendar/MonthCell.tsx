import type { Project } from "@shared/api.ts";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { blockMoments, monthCellFit } from "@/lib/calendarGrid.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { BlockTooltip, timeRange } from "./Block.tsx";
import { MIN_HOUR_PX } from "./constants.ts";
import { DayTooltip, dayFigures } from "./DayHeader.tsx";

/** Height of the date line at the top of a cell. */
export const CELL_HEAD_PX = 28;
/** Height of one work line (and of "+n more"), plus the gap below it. */
export const CELL_LINE_PX = 22;
/**
 * Marks a cell's date line shows. A day of quick questions can hold dozens; the rest join the
 * work lines below (and "+n more" when those run out) rather than being clipped out of sight.
 */
const MAX_MARKS = 6;

/** What a cell needs to draw a block and react to it. */
interface CellContext {
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}

/**
 * One day of the month view: the date (opens the day) with the day's short work as marks and its
 * working time, then its work as one line each in time order, as many as `slots` allows. Days of
 * the adjacent months are drawn empty and muted; the month is what was fetched.
 */
export function MonthCell({
  day,
  outside,
  today,
  blocks,
  slots,
  onOpenDay,
  ...context
}: CellContext & {
  day: number;
  /** A day of the previous or next month, padding the first or last week. */
  outside: boolean;
  today: boolean;
  blocks: PlacedBlock[];
  /** Work lines that fit under the date line. */
  slots: number;
  onOpenDay: (day: number) => void;
}) {
  const marks = blocks.filter((b) => b.mark);
  const shownMarks = marks.slice(0, MAX_MARKS);
  // `blocks` is in time order, so the lines stay in it with the leftover marks mixed in
  const lines = blocks.filter((b) => !b.mark || !shownMarks.includes(b));
  const { shown, more } = monthCellFit(lines.length, slots);
  // j / k can open a block that didn't fit; "+n more" then stands in for it, so the day shows
  // where the selection is and closing the drawer has somewhere to return focus to
  const hiddenSelected = lines.slice(shown).some((b) => blockState(b, context).selected);
  // The working time counts only work that matches the filter, as the week's day headers do
  const figures = dayFigures(blocks.filter((b) => context.matches(b.session, b.segment)));
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-l",
        today && "bg-primary/[0.04]",
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-1" style={{ height: CELL_HEAD_PX }}>
        <DateButton day={day} outside={outside} today={today} onOpen={() => onOpenDay(day)} />
        <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {shownMarks.map((b) => (
            <CellMark key={`${b.session.id}-${b.start}`} block={b} {...context} />
          ))}
        </span>
        {figures.shown > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 font-num text-[11px] text-muted-foreground">
                {durationLabel(figures.busy)}
              </span>
            </TooltipTrigger>
            <DayTooltip day={day} figures={figures} />
          </Tooltip>
        )}
      </div>
      <ul className="flex min-h-0 flex-col gap-0.5 px-1">
        {lines.slice(0, shown).map((b) => (
          <li key={`${b.session.id}-${b.start}`} className="min-w-0">
            <CellLine block={b} {...context} />
          </li>
        ))}
        {more > 0 && (
          <li>
            <button
              type="button"
              onClick={() => onOpenDay(day)}
              data-selected={hiddenSelected || undefined}
              className={cn(
                "h-5 w-full rounded-sm px-1.5 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                hiddenSelected && "text-foreground outline-2 outline-primary",
              )}
              aria-label={calendarMessages().moreWorkAria(more, dateLabel(day))}
            >
              {calendarMessages().moreWork(more)}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The cell's date; opens the day view. Today is circled in indigo, as in the week's headers. */
function DateButton({
  day,
  outside,
  today,
  onOpen,
}: {
  day: number;
  outside: boolean;
  today: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 font-num font-semibold text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
        today
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : outside
            ? "font-normal text-muted-foreground/60"
            : "text-foreground",
      )}
      aria-label={calendarMessages().openDay(dateLabel(day))}
      aria-current={today ? "date" : undefined}
    >
      {new Date(day).getDate()}
    </button>
  );
}

/** Project, selection and summary state shared by a cell's lines and marks. */
function blockState(b: PlacedBlock, c: CellContext) {
  const project = b.session.projectId !== null ? c.projects.get(b.session.projectId) : undefined;
  return {
    project,
    projectName: project?.name ?? formatMessages().unknownProject,
    selected:
      b.session.id === c.selectedId && (c.selectedAt === null || b.segment.start === c.selectedAt),
    faded: !c.matches(b.session, b.segment),
    // Work still in progress is only waiting for its summary, so it isn't toned down
    dim: !b.segment.summarized && !b.session.active,
  };
}

/**
 * A block as one line: its project's edge and fill, the heading, and a node when it made commits
 * or PRs (filled when it opened a PR). The tooltip is the week view's; clicking opens the drawer.
 */
function CellLine({ block, ...c }: CellContext & { block: PlacedBlock }) {
  const { session, segment } = block;
  const { project, projectName, selected, faded, dim } = blockState(block, c);
  const range = timeRange(block);
  const { commits, prs } = segment.activity;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => c.onSelect(session.id, segment.start)}
          aria-pressed={selected}
          data-selected={selected || undefined}
          aria-label={calendarMessages().blockAria(
            segment.headline,
            projectName,
            dateLabel(block.dayStart),
            range,
          )}
          className={cn(
            "flex h-5 w-full min-w-0 items-center gap-1 rounded-r-sm rounded-l-[2px] border-l-[3px] pr-1 pl-1.5 text-left text-xs outline-none",
            // The same fills as the week's blocks: the project color mixed into an achromatic base
            dim
              ? "bg-[color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))] text-muted-foreground"
              : "bg-[color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))] font-medium text-foreground",
            "hover:bg-[color-mix(in_oklch,var(--c)_var(--mix-block-hover),var(--block-base))]",
            "focus-visible:outline-2 focus-visible:outline-ring",
            selected && "font-medium text-foreground outline-2 outline-primary",
            faded &&
              !selected &&
              "opacity-30 transition-opacity hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
          )}
          style={
            { "--c": projectColor(project), borderLeftColor: "var(--c)" } as React.CSSProperties
          }
        >
          <span className="min-w-0 flex-1 truncate">{segment.headline}</span>
          {(commits > 0 || prs > 0) && <MomentNode pr={prs > 0} />}
        </button>
      </TooltipTrigger>
      <BlockTooltip
        label={segment.headline}
        projectName={projectName}
        session={session}
        range={range}
        durationMs={block.end - block.start}
        commits={commits}
        prs={prs}
        moments={blockMoments(block, MIN_HOUR_PX, Number.POSITIVE_INFINITY)}
        faded={faded}
        dim={dim}
      />
    </Tooltip>
  );
}

/** Short work as a mark beside the date, in the order it happened, as on the week's columns. */
function CellMark({ block, ...c }: CellContext & { block: PlacedBlock }) {
  const { session, segment } = block;
  const { project, projectName, selected, faded, dim } = blockState(block, c);
  const range = timeRange(block);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The hit area is taller than the bar, so a 3px line is still easy to point at */}
        <button
          type="button"
          onClick={() => c.onSelect(session.id, segment.start)}
          aria-pressed={selected}
          data-selected={selected || undefined}
          aria-label={calendarMessages().blockAria(
            segment.headline,
            projectName,
            dateLabel(block.dayStart),
            range,
          )}
          className={cn(
            "group flex h-2.5 w-2.5 shrink-0 items-center rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring",
            selected && "outline-2 outline-primary outline-offset-1",
            faded && !selected && "opacity-30 hover:opacity-100 focus-visible:opacity-100",
          )}
          style={{ "--c": projectColor(project) } as React.CSSProperties}
        >
          <span className="h-[3px] w-full rounded-full bg-[var(--c)] group-hover:h-1" />
        </button>
      </TooltipTrigger>
      <BlockTooltip
        label={segment.headline}
        projectName={projectName}
        session={session}
        range={range}
        durationMs={block.end - block.start}
        commits={segment.activity.commits}
        prs={segment.activity.prs}
        moments={blockMoments(block, MIN_HOUR_PX, Number.POSITIVE_INFINITY)}
        faded={faded}
        dim={dim}
      />
    </Tooltip>
  );
}

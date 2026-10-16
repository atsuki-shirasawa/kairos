import type { Project } from "@shared/api.ts";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { tooltipFacts } from "@/lib/blockFacts.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { blockMoments } from "@/lib/moments.ts";
import { monthCellFit, splitCellBlocks } from "@/lib/monthGrid.ts";
import { isDim, isSelected, projectOf } from "@/lib/selection.ts";
import { dayFigures } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";
import { BlockTooltip } from "./BlockTooltip.tsx";
import { FADED, LINE_FILL } from "./blockFills.ts";
import { MIN_HOUR_PX } from "./constants.ts";
import { DayTooltip } from "./DayHeader.tsx";
import { Mark } from "./Mark.tsx";

/** Height of the date line at the top of a cell. */
export const CELL_HEAD_PX = 28;
/** Height of one work line (and of "+n more"), plus the gap below it. */
export const CELL_LINE_PX = 22;
/**
 * Marks a cell's date line shows. A day of quick questions can hold dozens; the rest join the
 * work lines below (and "+n more" when those run out) rather than being clipped out of sight.
 */
const MAX_MARKS = 6;
/**
 * Work on a day of the adjacent months: as muted as the day's date, but still there to click. Set
 * per block rather than on the list, so it doesn't stack with the filter's fade or fade the
 * selection's outline.
 */
const OUTSIDE = "opacity-60";

/** What a cell needs to draw a block and react to it. */
interface CellContext {
  /** The cell is a day of the adjacent months: its work is dimmed like its date. */
  outside: boolean;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}

/**
 * One day of the month view: the date (opens the day) with the day's short work as marks and its
 * working time, then its work as one line each in time order, as many as `slots` allows. Days of
 * the adjacent months show their work too, at 60% like their date: work late on the 31st often
 * runs on into the 1st, and a blank cell there reads as a day without work.
 */
export function MonthCell({
  day,
  today,
  blocks,
  slots,
  onOpenDay,
  ...context
}: CellContext & {
  day: number;
  today: boolean;
  blocks: PlacedBlock[];
  /** Work lines that fit under the date line. */
  slots: number;
  onOpenDay: (day: number) => void;
}) {
  const { marks: shownMarks, lines } = splitCellBlocks(blocks, MAX_MARKS);
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
        <DateButton
          day={day}
          outside={context.outside}
          today={today}
          onOpen={() => onOpenDay(day)}
        />
        <span className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {shownMarks.map((runs) => (
            <CellMark key={`${runs[0]?.session.id}-${runs[0]?.start}`} runs={runs} {...context} />
          ))}
        </span>
        {figures.shown > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 font-num text-meta text-muted-foreground">
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
                "h-5 w-full rounded-sm px-1.5 text-left text-meta text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
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
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 font-num font-semibold text-label hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
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
  const project = projectOf(c.projects, b.session.projectId);
  return {
    project,
    selected: isSelected(b, c.selectedId, c.selectedAt),
    faded: !c.matches(b.session, b.segment),
    dim: isDim(b),
  };
}

/**
 * A block as one line: its project's edge and fill, the heading, and a node when it made commits
 * or PRs (filled when it opened a PR). The tooltip is the week view's; clicking opens the drawer.
 */
function CellLine({ block, ...c }: CellContext & { block: PlacedBlock }) {
  const { session, segment } = block;
  const { project, selected, faded, dim } = blockState(block, c);
  const moments = blockMoments(block, MIN_HOUR_PX, Number.POSITIVE_INFINITY);
  const facts = tooltipFacts(block, { project, faded, dim, moments });
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
            facts.label,
            facts.projectName,
            dateLabel(block.dayStart),
            facts.range,
          )}
          className={cn(
            "flex h-5 w-full min-w-0 items-center gap-1 rounded-r-sm rounded-l-[2px] border-l-[3px] pr-1 pl-1.5 text-left text-label outline-none",
            // Headless runs get the week's dashed edge here too
            session.headless && "border-dashed",
            // The same fills as the week's blocks
            dim ? LINE_FILL.dim : LINE_FILL.normal,
            LINE_FILL.hover,
            "focus-visible:outline-2 focus-visible:outline-ring",
            selected && "font-medium text-foreground outline-2 outline-primary",
            faded && !selected && FADED.line,
            c.outside && !selected && !faded && OUTSIDE,
          )}
          style={
            { "--c": projectColor(project), borderLeftColor: "var(--c)" } as React.CSSProperties
          }
        >
          <span className="min-w-0 flex-1 truncate">{segment.headline}</span>
          {(commits > 0 || prs > 0) && <MomentNode pr={prs > 0} />}
        </button>
      </TooltipTrigger>
      <BlockTooltip {...facts} />
    </Tooltip>
  );
}

/** Short work as a mark beside the date, in the order it happened, as on the week's columns. */
function CellMark({ runs, ...c }: CellContext & { runs: PlacedBlock[] }) {
  const [first] = runs;
  if (!first) return null;
  const states = runs.map((b) => blockState(b, c));
  const leadIndex = Math.max(
    0,
    states.findIndex((s) => !s.faded),
  );
  const selected = states.some((s) => s.selected);
  const faded = states.every((s) => s.faded);
  return (
    <Mark
      runs={runs}
      top={null}
      hourPx={MIN_HOUR_PX}
      lead={runs[leadIndex] ?? first}
      project={states[0]?.project}
      selected={selected}
      faded={faded}
      dim={states[leadIndex]?.dim ?? false}
      onSelect={c.onSelect}
      className={cn(c.outside && !selected && !faded && OUTSIDE)}
    />
  );
}

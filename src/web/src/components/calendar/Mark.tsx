import type { Project } from "@shared/api.ts";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { markFacts } from "@/lib/blockFacts.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel } from "@/lib/dates.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { BlockTooltip } from "./BlockTooltip.tsx";

/** Width of the strip on a day column's left that holds the marks, when the day has any. */
export const MARK_STRIP_PX = 14;

/**
 * Short work (under ten minutes) as a mark on the column's edge: a short bar in the project's
 * color at the time it happened. A quick question is a moment rather than a stretch of work, so
 * it gets a tick on the ruler instead of a card that would push longer work aside. Hovering shows
 * the same tooltip as a card; clicking opens it in the drawer.
 *
 * One mark can stand for a burst of headless runs (`runGroups`): it sits at the first run, reads
 * "n headless runs", and opens the first (during a search, the first that matches), with the
 * drawer stepping through the rest. In the week and day views it is placed at `top` on the
 * column; in a month cell it sits in line.
 */
export function Mark({
  runs,
  top,
  hourPx,
  project,
  lead,
  selected,
  faded,
  dim,
  onSelect,
  className,
}: {
  /** The block it stands for, or every run of a burst in time order (never empty). */
  runs: PlacedBlock[];
  /** The run a click opens: the first, or during a search the first that matches. */
  lead: PlacedBlock;
  /** Y of the mark, spread so close marks don't hide each other (`markTops`); null in line. */
  top: number | null;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  faded: boolean;
  dim: boolean;
  onSelect: (id: string, at: number) => void;
  /** Classes for a state the caller adds, such as a month cell's adjacent-month dim. */
  className?: string;
}) {
  const first = runs[0];
  if (!first) return null;
  const burst = runs.length > 1;
  const facts = markFacts(runs, lead, { project, faded, dim, hourPx });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The hit area is taller than the bar, so a 3px line is still easy to point at */}
        <button
          type="button"
          onClick={() => onSelect(lead.session.id, lead.segment.start)}
          aria-pressed={selected}
          data-selected={selected || undefined}
          aria-label={calendarMessages().blockAria(
            facts.label,
            facts.projectName,
            dateLabel(first.dayStart),
            facts.range,
          )}
          className={cn(
            "group flex h-2.5 w-2.5 items-center rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring",
            top === null ? "shrink-0" : "absolute left-0.5 z-[1] -translate-y-1/2",
            selected && "outline-2 outline-primary outline-offset-1",
            faded && !selected && "opacity-30 hover:opacity-100 focus-visible:opacity-100",
            className,
          )}
          style={{ top: top ?? undefined, "--c": projectColor(project) } as React.CSSProperties}
        >
          {burst ? <BurstBar /> : <MarkBar headless={first.session.headless} />}
        </button>
      </TooltipTrigger>
      <BlockTooltip {...facts} />
    </Tooltip>
  );
}

/**
 * A burst of headless runs: two rows of the headless dashes, one above the other, so it reads as
 * several runs stacked rather than one. The dashes keep it headless; the second row is the count.
 * Always headless: `runGroups` groups nothing else.
 */
function BurstBar() {
  return (
    <span className="flex w-full flex-col gap-px">
      <MarkBar headless />
      <MarkBar headless />
    </span>
  );
}

/**
 * The bar inside a mark (week, day and month views), in the project color set as `--c` on the
 * button. A headless run (claude -p / SDK) splits it into two dashes: at 3px an outline would leave
 * no hollow to see, and a broken line is what the dashed edge of a headless card already means.
 */
export function MarkBar({ headless }: { headless: boolean }) {
  const bar = "h-[3px] bg-[var(--c)] group-hover:h-1";
  if (!headless) return <span className={cn(bar, "w-full rounded-full")} />;
  // A fixed gap keeps the break visible whatever the button's width; square-ish ends keep each
  // 4px dash reading as part of a line rather than a dot
  return (
    <span className="flex w-full items-center gap-0.5">
      <span className={cn(bar, "flex-1 rounded-[1px]")} />
      <span className={cn(bar, "flex-1 rounded-[1px]")} />
    </span>
  );
}

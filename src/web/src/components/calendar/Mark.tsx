import type { Project } from "@shared/api.ts";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { blockMoments } from "@/lib/calendarGrid.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel } from "@/lib/dates.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { BlockTooltip, timeRange } from "./Block.tsx";

/** Width of the strip on a day column's left that holds the marks, when the day has any. */
export const MARK_STRIP_PX = 14;

/**
 * Short work (under ten minutes) as a mark on the column's edge: a short bar in the project's
 * color at the time it happened. A quick question is a moment rather than a stretch of work, so
 * it gets a tick on the ruler instead of a card that would push longer work aside. Hovering shows
 * the same tooltip as a card; clicking opens it in the drawer.
 */
export function Mark({
  block,
  top,
  hourPx,
  project,
  selected,
  faded,
  onSelect,
}: {
  block: PlacedBlock;
  /** Y of the mark, already spread so close marks don't hide each other (`markTops`). */
  top: number;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  faded: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const { session, segment } = block;
  const range = timeRange(block);
  const projectName = project?.name ?? formatMessages().unknownProject;
  const moments = blockMoments(block, hourPx, Number.POSITIVE_INFINITY);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The hit area is taller than the bar, so a 3px line is still easy to point at */}
        <button
          type="button"
          onClick={() => onSelect(session.id, segment.start)}
          aria-pressed={selected}
          data-selected={selected || undefined}
          aria-label={calendarMessages().blockAria(
            segment.headline,
            projectName,
            dateLabel(block.dayStart),
            range,
          )}
          className={cn(
            "group absolute left-0.5 z-[1] flex h-2.5 w-2.5 -translate-y-1/2 items-center rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring",
            selected && "outline-2 outline-primary outline-offset-1",
            faded && !selected && "opacity-30 hover:opacity-100 focus-visible:opacity-100",
          )}
          style={{ top, "--c": projectColor(project) } as React.CSSProperties}
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
        moments={moments}
        faded={faded}
        dim={!segment.summarized}
      />
    </Tooltip>
  );
}

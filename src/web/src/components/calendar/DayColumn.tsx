import type { Project } from "@shared/api.ts";
import { markTops } from "@/lib/calendarGrid.ts";
import { DAY, HOUR } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";
import { Block } from "./Block.tsx";
import { MARK_STRIP_PX, Mark } from "./Mark.tsx";

/**
 * One day of the time grid: hour lines, the current-time line on today, and the day's blocks.
 * Short work is drawn as marks in a strip on the left (only on days that have any), and the cards
 * take the rest of the width.
 */
export function DayColumn({
  day,
  detailed,
  blocks,
  hourPx,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
}: {
  day: number;
  /** Day view: wide blocks also show the summary body and PRs. */
  detailed: boolean;
  blocks: PlacedBlock[];
  hourPx: number;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}) {
  const today = now >= day && now < day + DAY;
  const isSelected = (b: PlacedBlock) =>
    b.session.id === selectedId && (selectedAt === null || b.segment.start === selectedAt);
  const projectOf = (b: PlacedBlock) =>
    b.session.projectId !== null ? projects.get(b.session.projectId) : undefined;
  const cards = blocks.filter((b) => !b.mark);
  const marks = blocks.filter((b) => b.mark).sort((a, b) => a.start - b.start);
  const tops = markTops(marks.map((b) => (b.start / HOUR) * hourPx));
  return (
    <div
      className={cn("relative min-w-0 border-l", today && "bg-primary/[0.04]")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
      }}
    >
      {/* Draw the current-time line under the blocks, so it doesn't hide a short block just before it */}
      {today && <NowLine top={((now - day) / HOUR) * hourPx} />}
      <div
        className="absolute inset-y-0 right-0"
        style={{ left: marks.length > 0 ? MARK_STRIP_PX : 0 }}
      >
        {cards.map((b) => (
          <Block
            key={`${b.session.id}-${b.start}`}
            block={b}
            detailed={detailed}
            hourPx={hourPx}
            project={projectOf(b)}
            selected={isSelected(b)}
            faded={!matches(b.session, b.segment)}
            onSelect={onSelect}
          />
        ))}
      </div>
      {marks.map((b, i) => (
        <Mark
          key={`${b.session.id}-${b.start}`}
          block={b}
          top={tops[i] ?? 0}
          hourPx={hourPx}
          project={projectOf(b)}
          selected={isSelected(b)}
          faded={!matches(b.session, b.segment)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** The current-time line across today's column, with a dot at its left end. */
function NowLine({ top }: { top: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 h-0.5 bg-primary"
      style={{ top }}
      aria-hidden
    >
      <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary" />
    </div>
  );
}

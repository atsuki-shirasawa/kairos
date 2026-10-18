import type { Project } from "@shared/api.ts";
import { DAY, HOUR } from "@shared/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { markTops, runGroups } from "@/lib/marks.ts";
import { isDim, isSelected, projectOf } from "@/lib/selection.ts";
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
  const selected = (b: PlacedBlock) => isSelected(b, selectedId, selectedAt);
  const cards = blocks.filter((b) => !b.mark);
  const marks = runGroups(blocks.filter((b) => b.mark).sort((a, b) => a.start - b.start));
  const tops = markTops(marks.map(([b]) => ((b?.start ?? 0) / HOUR) * hourPx));
  return (
    <div
      className={cn("relative min-w-0 border-l", today && "bg-primary/[0.04]")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
      }}
    >
      {/* Draw the current-time line under the blocks, so it doesn't hide a short block just before it */}
      {today && <NowLine top={((now - day) / HOUR) * hourPx} />}
      {/* Isolated, so the blocks' z-indexes (lifted during a search) stay inside this layer */}
      <div
        className="absolute inset-y-0 right-0 isolate"
        style={{ left: marks.length > 0 ? MARK_STRIP_PX : 0 }}
      >
        {cards.map((b) => (
          <Block
            key={`${b.session.id}-${b.start}`}
            block={b}
            detailed={detailed}
            hourPx={hourPx}
            project={projectOf(projects, b.session.projectId)}
            selected={selected(b)}
            faded={!matches(b.session, b.segment)}
            onSelect={onSelect}
          />
        ))}
      </div>
      {marks.map((runs, i) => {
        const [b] = runs;
        if (!b) return null;
        // The tooltip and the click describe the lead, so its summary state is the one to show
        const lead = runs.find((r) => matches(r.session, r.segment)) ?? b;
        return (
          <Mark
            key={`${b.session.id}-${b.start}`}
            runs={runs}
            top={tops[i] ?? 0}
            hourPx={hourPx}
            project={projectOf(projects, b.session.projectId)}
            lead={lead}
            selected={runs.some(selected)}
            faded={!runs.some((r) => matches(r.session, r.segment))}
            dim={isDim(lead)}
            onSelect={onSelect}
          />
        );
      })}
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

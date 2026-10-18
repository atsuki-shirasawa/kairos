import { useMemo } from "react";
import { journalMessages } from "@/i18n/messages/journal.ts";
import { dateLabel, durationLabel } from "@/lib/dates.ts";
import { blocksOfDay, type DayBlock } from "@/lib/dayBlocks.ts";
import { type DayRow, dayRows, type LaneLook, type LaneMark, laneLooks } from "@/lib/dayRows.ts";
import type { PeriodBodyProps } from "@/lib/periodBody.ts";
import { groupLead, groupMatches, isGroupSelected, projectOf } from "@/lib/selection.ts";
import { dayFigures } from "@/lib/totals.ts";
import { BlockRow } from "./BlockRow.tsx";
import { DayFiguresLine } from "./DayFiguresLine.tsx";
import { Lanes } from "./Lanes.tsx";
import { useScrollToSelected } from "./useScrollToSelected.ts";

/**
 * The Journal's day: the day's figures, then its work as a list in time order with a lane per
 * session beside it, so parallel work reads as parallel lines and empty hours take one line. The
 * selected block's detail is the pane beside it.
 */
export function DayPage({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
}: PeriodBodyProps) {
  const day = days[0] ?? now;
  const blocks = useMemo(() => blocksOfDay(sessions, day), [sessions, day]);
  const rows = useMemo(() => dayRows(blocks), [blocks]);
  const looks = useMemo(() => laneLooks(sessions, projects), [sessions, projects]);
  // Day totals count only work that matches the filter
  const figures = dayFigures(blocks.filter((b) => matches(b.session, b.segment)));
  // The row may arrive after the selection (a search hit on another day loads its day first)
  const selectedShown = rows.some(
    (r) => r.kind === "block" && isGroupSelected(r.blocks, selectedId, selectedAt),
  );
  const scrollRef = useScrollToSelected<HTMLDivElement>(
    `${selectedId}@${selectedAt}@${day}@${selectedShown}`,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="border-b">
        <DayFiguresLine figures={figures} />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <ol aria-label={journalMessages().dayWork(dateLabel(day))} className="py-2">
          {rows.map((row) =>
            row.kind === "quiet" ? (
              <QuietRow key={rowKey(row)} ms={row.ms} lanes={row.lanes} looks={looks} />
            ) : (
              <BlockRow
                key={rowKey(row)}
                runs={row.blocks}
                lead={groupLead(row.blocks, matches) ?? (row.blocks[0] as DayBlock)}
                lanes={row.lanes}
                looks={looks}
                project={projectOf(projects, row.blocks[0]?.session.projectId ?? null)}
                selected={isGroupSelected(row.blocks, selectedId, selectedAt)}
                faded={!groupMatches(row.blocks, matches)}
                onSelect={onSelect}
              />
            ),
          )}
        </ol>
      </div>
    </div>
  );
}

/** A row's key: its first block, or for a quiet row when it ends. */
function rowKey(row: DayRow): string {
  if (row.kind === "quiet") return `quiet@${row.until}`;
  const lead = row.blocks[0];
  return `${lead?.session.id}@${lead?.segment.start}@${lead?.dayStart}`;
}

/** A stretch with no work, as one line; the sessions still going on pass through it. */
function QuietRow({
  ms,
  lanes,
  looks,
}: {
  ms: number;
  lanes: LaneMark[];
  looks: ReadonlyMap<string, LaneLook>;
}) {
  return (
    <li className="flex pr-4 pl-3">
      <Lanes marks={lanes} looks={looks} />
      <span className="ml-1.5 px-2.5 py-2 font-num text-meta text-muted-foreground">
        {journalMessages().quiet(durationLabel(ms))}
      </span>
    </li>
  );
}

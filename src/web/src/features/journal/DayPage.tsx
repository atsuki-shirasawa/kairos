import { useMemo } from "react";
import { journalMessages } from "@/i18n/messages/journal.ts";
import { dateLabel } from "@/lib/dates.ts";
import { blocksOfDay } from "@/lib/dayBlocks.ts";
import { dayRows, laneLooks } from "@/lib/dayRows.ts";
import type { PeriodBodyProps } from "@/lib/periodBody.ts";
import { isGroupSelected } from "@/lib/selection.ts";
import { dayFigures } from "@/lib/totals.ts";
import { DayFiguresLine } from "./DayFiguresLine.tsx";
import { DayRows } from "./DayRows.tsx";
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
        <DayRows
          label={journalMessages().dayWork(dateLabel(day))}
          rows={rows}
          looks={looks}
          projects={projects}
          selectedId={selectedId}
          selectedAt={selectedAt}
          matches={matches}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

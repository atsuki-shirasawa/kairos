import { useMemo, useRef } from "react";
import { isSameDay } from "@/lib/dates.ts";
import { layoutDay } from "@/lib/layout.ts";
import { selectedSegment } from "@/lib/navigation.ts";
import type { PeriodBodyProps } from "@/lib/periodBody.ts";
import { cn } from "@/lib/utils.ts";
import { columnTracks, focusDayIndex } from "@/lib/weekColumns.ts";
import { GUTTER, GUTTER_PX } from "./constants.ts";
import { DayColumn } from "./DayColumn.tsx";
import { DayHeader } from "./DayHeader.tsx";
import { EdgeButton } from "./EdgeButton.tsx";
import { HourLabels } from "./HourLabels.tsx";
import { useGridScroll, useGridSize, useOffscreenEdges } from "./hooks.ts";

/** Animate column width changes so it's easy to follow which day widened. */
const ANIMATE_COLUMNS =
  "transition-[grid-template-columns] duration-200 motion-reduce:transition-none";

/** The calendar layout: a time grid with one column per day, drawing work blocks at their times. */
export function CalendarGrid({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
  onOpenDay,
}: PeriodBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hourPx, viewportPx, widthPx } = useGridSize(scrollRef);
  const columns = useMemo(() => days.map((day) => layoutDay(sessions, day)), [days, sessions]);
  const firstDay = days[0] ?? 0;
  const selectedDrawn = selectedSegment(sessions, selectedId, selectedAt) !== null;
  useGridScroll(scrollRef, { firstDay, hourPx, viewportPx, selectedId, selectedAt, selectedDrawn });
  const { edges, measure } = useOffscreenEdges(scrollRef, columns, hourPx, viewportPx);
  const scrollTo = (top: number) => scrollRef.current?.scrollTo({ top, behavior: "smooth" });

  // Days with parallel work get more width, days without work (e.g. after today) get narrow.
  // With the drawer open, the selected day keeps its width if lanes would get too narrow
  const focusIndex = useMemo(
    () => focusDayIndex(sessions, selectedId, selectedAt, days),
    [sessions, selectedId, selectedAt, days],
  );
  const lanes = columns.map((c) => Math.max(0, ...c.map((b) => b.cols)));
  const tracks = columnTracks(lanes, widthPx - GUTTER_PX, focusIndex);
  const template = { gridTemplateColumns: `${GUTTER} ${tracks.join(" ")}` };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      {/* Both rows reserve the scrollbar's width, so the header's day columns line up with the body's */}
      <div
        className={cn("grid overflow-y-hidden border-b [scrollbar-gutter:stable]", ANIMATE_COLUMNS)}
        style={template}
      >
        <div />
        {days.map((day, i) => (
          <DayHeader
            key={day}
            day={day}
            single={days.length === 1}
            // Day totals count only work that matches the filter
            blocks={(columns[i] ?? []).filter((b) => matches(b.session, b.segment))}
            today={isSameDay(day, now)}
            onOpen={() => onOpenDay(day)}
          />
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          onScroll={measure}
        >
          <div className={cn("grid", ANIMATE_COLUMNS)} style={{ ...template, height: 24 * hourPx }}>
            <HourLabels hourPx={hourPx} />
            {days.map((day, i) => (
              <DayColumn
                key={day}
                day={day}
                detailed={days.length === 1}
                blocks={columns[i] ?? []}
                hourPx={hourPx}
                projects={projects}
                selectedId={selectedId}
                selectedAt={selectedAt}
                now={now}
                matches={matches}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
        {edges.above && <EdgeButton edge={edges.above} where="above" onClick={scrollTo} />}
        {edges.below && <EdgeButton edge={edges.below} where="below" onClick={scrollTo} />}
      </div>
    </div>
  );
}

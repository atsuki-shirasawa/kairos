import { startOfDay } from "@shared/dates.ts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { ImportProgress } from "@/hooks/useLiveUpdates.ts";
import type { PeriodData } from "@/hooks/usePeriodData.ts";
import type { UrlStateUpdate } from "@/hooks/useUrlState.ts";
import { appMessages } from "@/i18n/messages/app.tsx";
import { dateLabel } from "@/lib/dates.ts";
import { type Filter, isFocused, withoutConditions } from "@/lib/filter.ts";
import { LAYOUTS } from "@/lib/layouts.ts";
import { hiddenReason } from "@/lib/projectVisibility.ts";
import type { UrlState } from "@/lib/urlState.ts";
import type { View } from "@/lib/view.ts";

/**
 * The messages over the period body: the server went away, the period has nothing to show, or the
 * filter left nothing of it.
 */
export function PeriodNotices({
  state,
  data,
  progress,
  searchPanel,
  update,
  onFilter,
}: {
  state: UrlState;
  data: PeriodData;
  progress: ImportProgress;
  /**
   * Whether the search results panel is open. It drops over the top of the period, where the
   * no-match notice sits; it already says what matched, so the notice waits until it closes
   * rather than peeking out under it.
   */
  searchPanel: boolean;
  update: UrlStateUpdate;
  onFilter: (filter: Filter) => void;
}) {
  const m = appMessages();
  const { calendar, visible, focused } = data;
  const { hasPeriod } = LAYOUTS[state.layout];
  return (
    <>
      {data.disconnected && <Notice>{m.disconnected(<code>kairos ensure</code>)}</Notice>}
      {hasPeriod && data.loaded && calendar.data && visible.length === 0 && (
        <EmptyNotice
          period={state.view}
          progress={progress}
          hiddenBy={hiddenReason(data.sessions, data.projectMap)}
          prev={calendar.data.prev}
          next={calendar.data.next}
          onJump={(t) => update({ anchor: startOfDay(t) })}
        />
      )}
      {hasPeriod &&
        visible.length > 0 &&
        focused.length === 0 &&
        isFocused(state.filter) &&
        !searchPanel && (
          <NoMatchNotice
            period={state.view}
            onClear={() => onFilter({ ...withoutConditions(state.filter), q: "" })}
          />
        )}
    </>
  );
}

/** When the period has nothing to show, explain why and what to do next. */
function EmptyNotice({
  period,
  progress,
  hiddenBy,
  prev,
  next,
  onJump,
}: {
  period: View;
  progress: ImportProgress;
  /** There are sessions, but all are hidden. What hid them. */
  hiddenBy: "project" | "brief" | null;
  prev: number | null;
  next: number | null;
  onJump: (t: number) => void;
}) {
  const m = appMessages();
  if (progress)
    return (
      <EmptyState>
        {m.ingesting(Math.floor((progress.done / Math.max(progress.total, 1)) * 100))}
      </EmptyState>
    );
  if (hiddenBy === "project") return <EmptyState>{m.hiddenByProject(period)}</EmptyState>;
  if (hiddenBy === "brief") return <EmptyState>{m.hiddenByBrief(period)}</EmptyState>;
  if (prev === null && next === null) return <EmptyState>{m.noRecordsYet}</EmptyState>;
  return (
    <EmptyState>
      <p>{m.noRecords(period)}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {prev !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(prev)}>
            <ChevronLeft />
            {m.previous}
            <span className="font-num text-muted-foreground">{dateLabel(prev)}</span>
          </Button>
        )}
        {next !== null && (
          <Button variant="outline" size="xs" onClick={() => onJump(next)}>
            {m.next}
            <span className="font-num text-muted-foreground">{dateLabel(next)}</span>
            <ChevronRight />
          </Button>
        )}
      </div>
    </EmptyState>
  );
}

/** The filter left nothing of a period that has work: say so and offer to clear it. */
function NoMatchNotice({ period, onClear }: { period: View; onClear: () => void }) {
  const m = appMessages();
  return (
    <Notice>
      <p>{m.noMatch(period)}</p>
      <Button variant="outline" size="xs" className="mt-2" onClick={onClear}>
        {m.clearFilter}
      </Button>
    </Notice>
  );
}

/**
 * A status message floating over the top of the period body, for states that sit over content
 * still on screen (blocks faded by a filter, the last data before the server went away).
 */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
      <div
        className="pointer-events-auto rounded-md border bg-popover px-4 py-2 text-center text-body text-muted-foreground shadow-sm"
        role="status"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The period body's state when it has nothing to show, centered in the empty area. Plain text on
 * the page rather than a bordered card, so it reads as the page's state, not a passing toast.
 */
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
      <div
        className="pointer-events-auto max-w-md px-4 py-3 text-center text-body text-muted-foreground"
        role="status"
      >
        {children}
      </div>
    </div>
  );
}

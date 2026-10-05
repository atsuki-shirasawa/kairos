import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import type { View } from "@/lib/dates.ts";

/**
 * Previous / today / next as one joined group. It sits left of the heading, the usual
 * calendar-app layout.
 */
export function PeriodNav({
  view,
  onMove,
  onToday,
}: {
  view: View;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
}) {
  const m = toolbarMessages();
  return (
    <div className="flex shrink-0 items-center rounded-md border bg-card">
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-r-none"
        onClick={() => onMove(-1)}
        aria-label={m.prev(view)}
        title={`${m.prev(view)} (←)`}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="rounded-none border-x px-3"
        onClick={onToday}
        title={`${m.today} (t)`}
      >
        {m.today}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-l-none"
        onClick={() => onMove(1)}
        aria-label={m.next(view)}
        title={`${m.next(view)} (→)`}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

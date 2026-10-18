import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { keyCap } from "@/lib/shortcuts.ts";
import type { View } from "@/lib/view.ts";

/**
 * Previous / the current period / next, kept together by spacing rather than a shared frame. It
 * sits left of the heading, the usual calendar-app layout.
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
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMove(-1)}
        aria-label={m.prev(view)}
        title={`${m.prev(view)} (${keyCap("prevPeriod")})`}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        size="default"
        className="px-2.5"
        onClick={onToday}
        title={`${m.current(view)} (${keyCap("today")})`}
      >
        {m.current(view)}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onMove(1)}
        aria-label={m.next(view)}
        title={`${m.next(view)} (${keyCap("nextPeriod")})`}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

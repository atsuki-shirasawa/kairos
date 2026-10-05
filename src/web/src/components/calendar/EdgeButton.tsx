import { ArrowDown, ArrowUp } from "lucide-react";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import type { Edge } from "@/lib/calendarGrid.ts";
import { hhmm } from "@/lib/dates.ts";
import { cn } from "@/lib/utils.ts";

/** A pill on the top or bottom edge of the grid, pointing at work scrolled out of view. */
export function EdgeButton({
  edge,
  where,
  onClick,
}: {
  edge: Edge;
  where: "above" | "below";
  onClick: (top: number) => void;
}) {
  const Icon = where === "above" ? ArrowUp : ArrowDown;
  const m = calendarMessages();
  const text =
    where === "above"
      ? m.edgeAbove(hhmm(edge.time), edge.count)
      : m.edgeBelow(hhmm(edge.time), edge.count);
  return (
    <button
      type="button"
      onClick={() => onClick(Math.max(0, edge.scrollTo))}
      className={cn(
        "absolute left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-3 py-1 font-num text-muted-foreground text-xs shadow-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        where === "above" ? "top-2" : "bottom-2",
      )}
      aria-label={m.edgeAria(where === "above", text)}
    >
      <Icon className="size-3" />
      {text}
    </button>
  );
}

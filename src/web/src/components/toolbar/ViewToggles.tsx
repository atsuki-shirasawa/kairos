import { CalendarDays, ChartColumn } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import type { Layout, View } from "@/lib/dates.ts";
import { SEGMENT, SEGMENTED } from "./segmented.ts";

/** The periods in the dropdown, largest first, with their labels and shortcut keys. */
function views(): [View, string, string][] {
  const m = toolbarMessages();
  return [
    ["month", m.month, "m"],
    ["week", m.week, "w"],
    ["day", m.day, "d"],
  ];
}

/**
 * Switches the period between a month, a week and a day. A dropdown rather than three segments,
 * so the toolbar stays narrow; the keys (m / w / d) switch without opening it. It stands on its
 * own, outlined, apart from the layout toggle: sharing a track made the two read as one switch.
 */
export function ViewToggle({ view, onView }: { view: View; onView: (view: View) => void }) {
  const m = toolbarMessages();
  return (
    <Select value={view} onValueChange={(v) => onView(v as View)}>
      <SelectTrigger
        size="default"
        aria-label={m.viewToggle}
        title={m.viewTitle}
        className="shrink-0 gap-1 rounded-md bg-card px-2.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-0 dark:bg-card dark:hover:bg-accent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="min-w-32">
        {views().map(([value, label, key]) => (
          <SelectItem
            key={value}
            value={value}
            hint={<kbd className="ml-auto font-num text-[11px] text-muted-foreground">{key}</kbd>}
          >
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Switches the main area between the calendar and the summary. */
export function LayoutToggle({
  layout,
  onLayout,
}: {
  layout: Layout;
  onLayout: (layout: Layout) => void;
}) {
  const m = toolbarMessages();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      // The table is a tab of the summary, so it lights the summary button
      value={layout === "list" ? "summary" : layout}
      onValueChange={(v) => v && onLayout(v as Layout)}
      aria-label={m.layoutToggle}
      className={`shrink-0 ${SEGMENTED}`}
    >
      <ToggleGroupItem
        value="calendar"
        className={SEGMENT}
        aria-label={m.calendar}
        title={`${m.calendar} (c)`}
      >
        <CalendarDays />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="summary"
        className={SEGMENT}
        aria-label={m.summary}
        title={`${m.summary} (s)`}
      >
        <ChartColumn />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

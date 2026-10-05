import { CalendarDays, LayoutDashboard } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import type { Layout, View } from "@/lib/dates.ts";
import { SEGMENT, SEGMENTED } from "./segmented.ts";

/** Switches the period between a week and a day. */
export function ViewToggle({ view, onView }: { view: View; onView: (view: View) => void }) {
  const m = toolbarMessages();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      className={SEGMENTED}
      value={view}
      onValueChange={(v) => v && onView(v as View)}
      aria-label={m.viewToggle}
    >
      <ToggleGroupItem value="week" className={SEGMENT} title={m.weekTitle}>
        {m.week}
      </ToggleGroupItem>
      <ToggleGroupItem value="day" className={SEGMENT} title={m.dayTitle}>
        {m.day}
      </ToggleGroupItem>
    </ToggleGroup>
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
      className={SEGMENTED}
      // The table is a tab of the summary, so it lights the summary button
      value={layout === "list" ? "summary" : layout}
      onValueChange={(v) => v && onLayout(v as Layout)}
      aria-label={m.layoutToggle}
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
        <LayoutDashboard />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

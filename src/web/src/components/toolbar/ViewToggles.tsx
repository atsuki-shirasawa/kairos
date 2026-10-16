import { CalendarDays, ChartColumn, type LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { LAYOUT_IDS, LAYOUTS } from "@/lib/layouts.ts";
import { keyCap } from "@/lib/shortcuts.ts";
import type { Layout, View } from "@/lib/view.ts";
import { SEGMENT, SEGMENTED } from "./segmented.ts";

/** The periods in the dropdown, largest first, with their labels and shortcut keys. */
function views(): [View, string, string][] {
  const m = toolbarMessages();
  return [
    ["month", m.month, keyCap("month")],
    ["week", m.week, keyCap("week")],
    ["day", m.day, keyCap("day")],
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

/** How a layout's segment looks: its icon, and its name read from the toolbar's messages. */
interface SegmentLook {
  Icon: LucideIcon;
  label: (m: ReturnType<typeof toolbarMessages>) => string;
}

/**
 * The toggle's segments, one per layout that has one: the table is a tab of the summary, and the
 * live page has its own button. Every layout is listed, so a new one has to choose.
 */
const SEGMENTS: Record<Layout, SegmentLook | null> = {
  calendar: { Icon: CalendarDays, label: (m) => m.calendar },
  summary: { Icon: ChartColumn, label: (m) => m.summary },
  table: null,
  live: null,
};

/** Switches the main area between the layouts that have a segment (the calendar and the summary). */
export function LayoutToggle({
  lit,
  onLayout,
}: {
  /** The layout whose control the shown one lights (see `LAYOUTS`). */
  lit: Layout;
  onLayout: (layout: Layout) => void;
}) {
  const m = toolbarMessages();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      // A layout lit elsewhere (the live page lights its own button) leaves every segment off
      value={SEGMENTS[lit] ? lit : ""}
      onValueChange={(v) => {
        const layout = LAYOUT_IDS.find((l) => l === v);
        if (layout) onLayout(layout);
      }}
      aria-label={m.layoutToggle}
      className={`shrink-0 ${SEGMENTED}`}
    >
      {LAYOUT_IDS.map((layout) => {
        const look = SEGMENTS[layout];
        if (!look) return null;
        const label = look.label(m);
        return (
          <ToggleGroupItem
            key={layout}
            value={layout}
            className={SEGMENT}
            aria-label={label}
            title={`${label} (${keyCap(LAYOUTS[layout].shortcut)})`}
          >
            <look.Icon />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

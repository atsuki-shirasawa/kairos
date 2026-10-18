import type { CalendarSession } from "@shared/api.ts";
import { useEffect, useMemo, useRef } from "react";
import type { UrlStateUpdate } from "@/hooks/useUrlState.ts";
import { overlaps } from "@/lib/dayBlocks.ts";
import { orderedBlocks, selectedSegment } from "@/lib/navigation.ts";
import { useMediaQuery, WIDE_QUERY } from "./useMediaQuery.ts";

/**
 * Keeps the detail pane open where a layout pins it (the day page) and the screen is wide enough
 * to hold it beside the page. With no block open, or after moving to a period that doesn't hold
 * the open one, it opens the period's first block. A block chosen while a period shows stands,
 * even on another day (a section of the session from the drawer, or the block an open item
 * links to). The URL entry is replaced, not pushed, so Back doesn't stop on it. Returns whether
 * the pane is pinned now; on a narrow screen the drawer covers the page, so it opens only when
 * asked for and can be closed.
 */
export function usePinnedDetail({
  pinned,
  ready,
  focused,
  visible,
  from,
  to,
  session,
  at,
  update,
}: {
  /** The layout pins the drawer for this period length (`drawerPinned`). */
  pinned: boolean;
  /**
   * The shown period's own data is in, not the previous period's kept on screen while it loads,
   * whose first block would belong to another day.
   */
  ready: boolean;
  focused: CalendarSession[];
  visible: CalendarSession[];
  from: number;
  to: number;
  session: string | null;
  at: number | null;
  update: UrlStateUpdate;
}): boolean {
  const held = useMediaQuery(WIDE_QUERY) && pinned;
  const first = useMemo(() => orderedBlocks(focused, from, to)[0] ?? null, [focused, from, to]);
  const open = selectedSegment(visible, session, at);
  const shown = open !== null && overlaps(open, from, to);
  // The period the open block was last checked against; a choice made after that stands
  const checked = useRef<number | null>(null);
  useEffect(() => {
    if (!held || !ready) return;
    if (session && checked.current === from) return;
    checked.current = from;
    if (!shown && first) update({ session: first.id, at: first.at });
  }, [held, ready, from, session, shown, first, update]);
  return held;
}

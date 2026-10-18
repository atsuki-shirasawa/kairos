// What each global shortcut does, whether its key was pressed or the palette's row for it was
// picked. Pure apart from the targets it is handed, so it can be tested without a DOM.
import { startOfDay } from "@shared/dates.ts";
import { shift } from "./dates.ts";
import { LAYOUTS, layoutOfShortcut } from "./layouts.ts";
import type { BlockStepping } from "./navigation.ts";
import type { Shortcut } from "./shortcuts.ts";
import type { UrlState, UrlStateUpdate } from "./urlState.ts";

/** What the shortcuts read and act on. */
export interface ShortcutTargets extends BlockStepping {
  state: Pick<UrlState, "view" | "layout" | "anchor" | "session">;
  update: UrlStateUpdate;
  /** The time "today" moves the period to. */
  now: number;
  /**
   * null where there is no drawer to close (the page's pinned pane, or a popover open, which Esc
   * closes first), so Esc goes on to whatever else wants it.
   */
  closeDrawer: (() => void) | null;
  toggleMenu: () => void;
  focusSearch: () => void;
  togglePalette: () => void;
}

/** Shortcuts that only make sense with a period on screen. */
const PERIODLESS_IGNORED: ReadonlySet<Shortcut> = new Set([
  "prevPeriod",
  "nextPeriod",
  "today",
  "nextBlock",
  "prevBlock",
  // The search field narrows a period, so a page without one has no field to focus
  "search",
]);

/**
 * Runs a shortcut, from its key or from the palette's row for it. Returns false when it doesn't
 * apply now, so the key press passes through.
 */
export function runShortcut(shortcut: Shortcut, t: ShortcutTargets): boolean {
  const { state, update } = t;
  const layout = layoutOfShortcut(shortcut);
  if (layout) {
    update({ layout });
    return true;
  }
  // A layout without a period (Today): moving through periods or stepping through their
  // blocks would change a calendar nobody sees, so those keys pass through, and picking a period
  // goes to the calendar with it
  if (!LAYOUTS[state.layout].hasPeriod) {
    if (PERIODLESS_IGNORED.has(shortcut)) return false;
    if (shortcut === "month" || shortcut === "week" || shortcut === "day") {
      update({ layout: "calendar", view: shortcut });
      return true;
    }
  }
  switch (shortcut) {
    case "prevPeriod":
      update({ anchor: shift(state.view, state.anchor, -1) });
      break;
    case "nextPeriod":
      update({ anchor: shift(state.view, state.anchor, 1) });
      break;
    case "today":
      update({ anchor: startOfDay(t.now) });
      break;
    case "month":
      update({ view: "month" });
      break;
    case "week":
      update({ view: "week" });
      break;
    case "day":
      update({ view: "day" });
      break;
    case "nextBlock":
      t.goTo(t.next);
      break;
    case "prevBlock":
      t.goTo(t.prev);
      break;
    case "menu":
      t.toggleMenu();
      break;
    case "search":
      t.focusSearch();
      break;
    case "close":
      if (!state.session || !t.closeDrawer) return false;
      t.closeDrawer();
      break;
    case "palette":
      t.togglePalette();
      break;
  }
  return true;
}

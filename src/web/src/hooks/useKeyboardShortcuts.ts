// The app-wide keyboard shortcuts. Which key does what is in lib/shortcuts.ts.
import { useEffect, useEffectEvent } from "react";
import type { BlockStepping } from "@/hooks/useBlockNavigation.ts";
import type { UrlState, UrlStateUpdate } from "@/hooks/useUrlState.ts";
import { shift, startOfDay } from "@/lib/dates.ts";
import { type Shortcut, shortcutFor } from "@/lib/shortcuts.ts";

/** What the shortcuts read and act on. */
export interface ShortcutTargets extends BlockStepping {
  state: Pick<UrlState, "view" | "anchor" | "session">;
  update: UrlStateUpdate;
  closeDrawer: () => void;
  toggleMenu: () => void;
  focusSearch: () => void;
}

/**
 * Key presses left to their target: with a modifier (browser and OS shortcuts), while typing, and
 * inside the date picker, where the arrow keys move between days.
 */
function leftToTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    !!target?.closest("input, textarea, [contenteditable], [data-date-picker]")
  );
}

/**
 * Whether a popover (list, projects) is open; tooltips don't count. Esc then only closes it.
 * Radix hasn't closed it yet when the key arrives, so its content is still in the DOM.
 */
function popoverOpen(): boolean {
  return document.querySelector("[data-slot=popover-content]") !== null;
}

/** Runs a shortcut. Returns false when it doesn't apply now, so the key press passes through. */
function run(shortcut: Shortcut, t: ShortcutTargets): boolean {
  const { state, update } = t;
  switch (shortcut) {
    case "prevPeriod":
      update({ anchor: shift(state.view, state.anchor, -1) });
      break;
    case "nextPeriod":
      update({ anchor: shift(state.view, state.anchor, 1) });
      break;
    case "today":
      update({ anchor: startOfDay(Date.now()) });
      break;
    case "week":
      update({ view: "week" });
      break;
    case "day":
      update({ view: "day" });
      break;
    case "calendar":
      update({ layout: "calendar" });
      break;
    case "list":
      update({ layout: "list" });
      break;
    case "summary":
      update({ layout: "summary" });
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
      if (!state.session || popoverOpen()) return false;
      t.closeDrawer();
      break;
  }
  return true;
}

/** Listens for the global shortcuts on the window while mounted. */
export function useKeyboardShortcuts(targets: ShortcutTargets): void {
  // An effect event reads the latest targets without re-subscribing on every render
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (leftToTarget(e)) return;
    const shortcut = shortcutFor(e.key, e.shiftKey);
    if (shortcut && run(shortcut, targets)) e.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, []);
}

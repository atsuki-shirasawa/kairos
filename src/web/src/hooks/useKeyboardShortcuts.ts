// The app-wide keyboard shortcuts: when a key press is one, here. Which key does what is in
// lib/shortcuts.ts, and what each does in lib/shortcutActions.ts.

import { useEffect, useEffectEvent } from "react";
import { runShortcut, type ShortcutTargets } from "@/lib/shortcutActions.ts";
import { isPaletteKey, shortcutFor } from "@/lib/shortcuts.ts";

/** Whether a key press lands where typing goes: a field or editable text. */
function inField(e: KeyboardEvent): boolean {
  return !!(e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]");
}

/**
 * Key presses left to their target: with a modifier (browser and OS shortcuts), while typing,
 * inside the date picker, where the arrow keys move between days, and in an open dropdown, which
 * picks items by typing and closes on Esc.
 */
function leftToTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    inField(e) ||
    !!target?.closest("[data-date-picker], [data-slot=select-content]")
  );
}

/**
 * Whether a key press opens the palette here. ⌘K works while typing, as palettes do; Ctrl+K is
 * left to a field, where macOS deletes to the end of the line with it; neither interrupts an IME.
 */
function opensPalette(e: KeyboardEvent): boolean {
  return isPaletteKey(e) && !e.isComposing && (e.metaKey || !inField(e));
}

/**
 * Whether a popover (list, projects) is open; tooltips don't count. Esc then only closes it.
 * Radix hasn't closed it yet when the key arrives, so its content is still in the DOM.
 */
function popoverOpen(): boolean {
  return document.querySelector("[data-slot=popover-content]") !== null;
}

/** Listens for the global shortcuts on the window while mounted. */
export function useKeyboardShortcuts(targets: ShortcutTargets): void {
  // An effect event reads the latest targets without re-subscribing on every render
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Before the rest: it holds a modifier, and ⌘K works while typing
    if (opensPalette(e)) {
      e.preventDefault();
      targets.togglePalette();
      return;
    }
    if (leftToTarget(e)) return;
    const shortcut = shortcutFor(e.key, e.shiftKey);
    // With a popover open, Esc only closes it, so the drawer isn't there to close
    const now = { ...targets, closeDrawer: popoverOpen() ? null : targets.closeDrawer };
    if (shortcut && runShortcut(shortcut, now)) e.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, []);
}

// Maps keys to the global shortcuts, and groups them for the list in the "⋯" menu
// (components/toolbar/AppMenu.tsx) and the key hints in tooltips, which are derived from here.
// Which key presses are ignored (typing, modifiers, the date picker) is up to the caller.

/** What a global shortcut does. */
export type Shortcut =
  | "prevPeriod"
  | "nextPeriod"
  | "today"
  | "month"
  | "week"
  | "day"
  | "home"
  | "calendar"
  | "table"
  | "summary"
  | "nextBlock"
  | "prevBlock"
  | "menu"
  | "search"
  | "close"
  | "palette";

/** The key that opens the menu. Matched by hand in `shortcutFor`, so it isn't in `KEYS`. */
const MENU_KEY = "?";
/** The palette's key, held with ⌘ (Ctrl elsewhere). Matched by `isPaletteKey`, apart from `KEYS`. */
const PALETTE_KEY = "k";
/** How the palette's key is written: the app runs on macOS. */
const PALETTE_CAP = "⌘K";

/** A Map rather than an object, so keys like "constructor" can't hit the prototype. */
const KEYS = new Map<string, Shortcut>([
  ["ArrowLeft", "prevPeriod"],
  ["ArrowRight", "nextPeriod"],
  ["t", "today"],
  ["m", "month"],
  ["w", "week"],
  ["d", "day"],
  ["h", "home"],
  // The live page's key, kept for the hands that learned it: Today's Now took the page in
  ["n", "home"],
  ["c", "calendar"],
  ["l", "table"],
  ["s", "summary"],
  ["j", "nextBlock"],
  ["k", "prevBlock"],
  ["/", "search"],
  ["Escape", "close"],
]);

/**
 * Whether a key press is the palette's: ⌘K or Ctrl+K, with no other modifier. Where it may open
 * the palette (in a field, say) is up to the caller.
 */
export function isPaletteKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  // ⌘⇧K and ⌘⌥K are other apps' and the browser's
  return (
    (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === PALETTE_KEY
  );
}

/** The shortcut a key press triggers, or null when the key isn't one. */
export function shortcutFor(key: string, shiftKey: boolean): Shortcut | null {
  // On some keyboard layouts Shift+/ still arrives as "/", so accept both
  if (key === MENU_KEY || (key === "/" && shiftKey)) return "menu";
  return KEYS.get(key) ?? null;
}

/** How keys whose `KeyboardEvent.key` name is a word are written on a key cap. */
const CAPS: ReadonlyMap<string, string> = new Map([
  ["ArrowLeft", "←"],
  ["ArrowRight", "→"],
  ["Escape", "Esc"],
]);

/** The key a shortcut is bound to, as written on a key cap or in a tooltip ("t", "←", "Esc"). */
export function keyCap(shortcut: Shortcut): string {
  if (shortcut === "menu") return MENU_KEY;
  if (shortcut === "palette") return PALETTE_CAP;
  const key = [...KEYS].find(([, s]) => s === shortcut)?.[0] ?? "";
  return CAPS.get(key) ?? key;
}

/** A line of the menu's shortcut list: what the keys do, named by its message key. */
export type ShortcutGroup =
  | "period"
  | "today"
  | "view"
  | "layout"
  | "table"
  | "step"
  | "search"
  | "close"
  | "palette"
  | "menu";

/** The menu's shortcut list in display order, each line with the shortcuts it covers. */
export const SHORTCUT_GROUPS: readonly { group: ShortcutGroup; shortcuts: readonly Shortcut[] }[] =
  [
    { group: "period", shortcuts: ["prevPeriod", "nextPeriod"] },
    { group: "today", shortcuts: ["today"] },
    { group: "view", shortcuts: ["month", "week", "day"] },
    { group: "layout", shortcuts: ["home", "calendar", "summary"] },
    { group: "table", shortcuts: ["table"] },
    { group: "step", shortcuts: ["nextBlock", "prevBlock"] },
    { group: "search", shortcuts: ["search"] },
    { group: "close", shortcuts: ["close"] },
    { group: "palette", shortcuts: ["palette"] },
    { group: "menu", shortcuts: ["menu"] },
  ];

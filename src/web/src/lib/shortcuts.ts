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
  | "close";

/** The key that opens the menu. Matched by hand in `shortcutFor`, so it isn't in `KEYS`. */
const MENU_KEY = "?";

/** A Map rather than an object, so keys like "constructor" can't hit the prototype. */
const KEYS = new Map<string, Shortcut>([
  ["ArrowLeft", "prevPeriod"],
  ["ArrowRight", "nextPeriod"],
  ["t", "today"],
  ["m", "month"],
  ["w", "week"],
  ["d", "day"],
  ["h", "home"],
  ["c", "calendar"],
  ["l", "table"],
  ["s", "summary"],
  ["j", "nextBlock"],
  ["k", "prevBlock"],
  ["/", "search"],
  ["Escape", "close"],
]);

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
    { group: "menu", shortcuts: ["menu"] },
  ];

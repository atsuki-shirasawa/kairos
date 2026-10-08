// Maps keys to the global shortcuts. The list shown to users is in the "⋯" menu
// (components/toolbar/AppMenu.tsx); keep both in sync. Which key presses are ignored (typing,
// modifiers, the date picker) is up to the caller.

/** What a global shortcut does. */
export type Shortcut =
  | "prevPeriod"
  | "nextPeriod"
  | "today"
  | "month"
  | "week"
  | "day"
  | "calendar"
  | "list"
  | "summary"
  | "nextBlock"
  | "prevBlock"
  | "menu"
  | "search"
  | "close";

/** A Map rather than an object, so keys like "constructor" can't hit the prototype. */
const KEYS = new Map<string, Shortcut>([
  ["ArrowLeft", "prevPeriod"],
  ["ArrowRight", "nextPeriod"],
  ["t", "today"],
  ["m", "month"],
  ["w", "week"],
  ["d", "day"],
  ["c", "calendar"],
  ["l", "list"],
  ["s", "summary"],
  ["j", "nextBlock"],
  ["k", "prevBlock"],
  ["/", "search"],
  ["Escape", "close"],
]);

/** The shortcut a key press triggers, or null when the key isn't one. */
export function shortcutFor(key: string, shiftKey: boolean): Shortcut | null {
  // On some keyboard layouts Shift+/ still arrives as "/", so accept both
  if (key === "?" || (key === "/" && shiftKey)) return "menu";
  return KEYS.get(key) ?? null;
}

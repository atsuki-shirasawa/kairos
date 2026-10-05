/** Minimum height of an hour. Any lower and headings of short blocks become unreadable. */
export const MIN_HOUR_PX = 48;
/**
 * First hour shown on open. The hour height is chosen so this range fits the screen, and it is
 * centered.
 */
export const VIEW_START = 8;
/** Last hour shown on open (see `VIEW_START`). */
export const VIEW_END = 20;
/** Width of the hour label column, as a grid track. */
export const GUTTER = "3.5rem";
/** Width of the hour label column in px (`GUTTER`), subtracted before sharing width among days. */
export const GUTTER_PX = 56;
/** Right offset for stacked blocks, so the colored left edge of the block below stays visible. */
export const INDENT_PX = 8;
/** Spelled out per line count so Tailwind can pick up the class names. */
export const LINE_CLAMP = ["", "line-clamp-1", "line-clamp-2", "line-clamp-3"] as const;

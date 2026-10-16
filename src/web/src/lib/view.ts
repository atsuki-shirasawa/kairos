// What the app is showing: the length of the period, and the layout it is drawn in.

/** Length of the shown period. */
export type View = "month" | "week" | "day";

/**
 * How the main area draws: the calendar, the summary, its table tab, or the page of sessions
 * running now (which has no period). What sets each apart is in `layouts.ts`.
 */
export type Layout = "calendar" | "summary" | "table" | "live";

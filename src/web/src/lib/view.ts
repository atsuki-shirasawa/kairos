// What the app is showing: the length of the period, and the layout it is drawn in.

/** Length of the shown period. */
export type View = "month" | "week" | "day";

/**
 * How the main area draws: the home page of what is running and what was done last, the calendar,
 * the summary, or its table tab. The home page has no period. What sets each apart is in
 * `layouts.ts`.
 */
export type Layout = "today" | "calendar" | "summary" | "table";

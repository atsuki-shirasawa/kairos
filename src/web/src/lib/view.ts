// What the app is showing: the length of the period, and the layout it is drawn in.

/** Length of the shown period. */
export type View = "month" | "week" | "day";

/**
 * `list` is the summary's table tab (kept under its old name so existing URLs still open it).
 * `live` is the page of sessions running now, which has no period.
 */
export type Layout = "calendar" | "list" | "summary" | "live";

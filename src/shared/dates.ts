// Time units and local-date helpers shared by the server, the CLI and the web app. Times are in
// the machine's local time zone, like everything the user sees.

/** One minute in ms. */
export const MINUTE = 60_000;
/** One hour in ms. */
export const HOUR = 60 * MINUTE;
/** 24 hours in ms. A calendar day can differ across DST; step days with `startOfDay(t, n)` or Date. */
export const DAY = 24 * HOUR;
/** Seven 24-hour days in ms; the same DST caveat as `DAY` applies. */
export const WEEK = 7 * DAY;

/** Local midnight of the day containing `t`, moved by `days` (DST-safe, unlike adding 24h). */
export function startOfDay(t: number, days = 0): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` in local time: the UI's `?date=` value and the date in reports and prompts. */
export function isoDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * `HH:MM` in local time, zero-padded, for fixed-width text (the CLI, prompts). The UI's own `hhmm`
 * leaves the hour unpadded.
 */
export function hhmm(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

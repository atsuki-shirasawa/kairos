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

/** `YYYY-MM-DD` in local time: the Journal's day in its path, and the date in reports and prompts. */
export function isoDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local midnight of a `YYYY-MM-DD` day, or null when it isn't one. Dates that don't exist
 * (2026-02-30) are null too, instead of rolling over like `Date` does.
 */
export function parseIsoDay(value: string | null): number | null {
  const [y, mo, d] = (/^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "") ?? []).slice(1).map(Number);
  if (!y || !mo || !d) return null;
  const date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : null;
}

/**
 * `HH:MM` in local time, zero-padded, for fixed-width text (the CLI, prompts). The UI's own `hhmm`
 * leaves the hour unpadded.
 */
export function hhmm(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

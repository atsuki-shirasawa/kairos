// Small text and date helpers shared by the CLI commands. Times are in local time, like the UI's.
import { hhmm, isoDay, startOfDay } from "../shared/dates.ts";
import { type UiLinkTarget, uiLinkQuery } from "../shared/uiUrl.ts";

/** `YYYY-MM-DD HH:MM` in local time, for progress lines. */
export function formatTime(ms: number): string {
  return `${isoDay(ms)} ${hhmm(ms)}`;
}

/**
 * Local midnight of a day given as `today`, `yesterday` or `YYYY-MM-DD`; null when it is none of
 * them. Dates that don't exist (2026-02-30) are null too, instead of rolling over like `Date` does.
 */
export function parseDay(value: string, now = Date.now()): number | null {
  if (value === "today") return startOfDay(now);
  if (value === "yesterday") return startOfDay(now, -1);
  const [y, mo, d] = (/^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? []).slice(1).map(Number);
  if (!y || !mo || !d) return null;
  const date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : null;
}

/** Where the UI shows a day (in the day view), optionally with a session's drawer open. */
export function uiLink(base: string, at: UiLinkTarget = {}): string {
  const q = uiLinkQuery(at);
  return q.size ? `${base}?${q}` : base;
}

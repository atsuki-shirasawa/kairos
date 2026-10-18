// Small text and date helpers shared by the CLI commands. Times are in local time, like the UI's.
import { hhmm, isoDay, parseIsoDay, startOfDay } from "../shared/dates.ts";
import { type UiLinkTarget, uiLinkPath } from "../shared/uiUrl.ts";

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
  return parseIsoDay(value);
}

/** Where the UI shows a day (in the day view), optionally with a session's drawer open. */
export function uiLink(base: string, at: UiLinkTarget = {}): string {
  return new URL(uiLinkPath(at), base).href;
}

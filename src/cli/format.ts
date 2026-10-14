// Small text and date helpers shared by the CLI commands. Times are in local time, like the UI's.
import { hhmm, isoDay, startOfDay } from "../shared/dates.ts";

/**
 * Drops control characters. Headlines are LLM output over log text, so a prompt injection could
 * make one carry escape sequences (OSC 52 clipboard writes, fake hyperlinks) into the terminal.
 */
export function printable(text: string): string {
  return Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : ch;
  }).join("");
}

/** Text as one printable line: control characters and runs of whitespace become one space. */
export function oneLine(text: string): string {
  return printable(text).replace(/\s+/g, " ").trim();
}

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
export function uiLink(
  base: string,
  at: { day?: number; session?: string; start?: number } = {},
): string {
  const q = new URLSearchParams();
  if (at.day !== undefined) {
    q.set("view", "day");
    q.set("date", isoDay(at.day));
  }
  if (at.session) q.set("session", at.session);
  if (at.session && at.start) q.set("at", String(at.start));
  return q.size ? `${base}?${q}` : base;
}

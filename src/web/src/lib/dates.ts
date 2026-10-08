// Date arithmetic and labels. Times are in the browser's local time zone.
import { dateMessages } from "@/i18n/messages/dates.ts";

/** One minute in ms. */
export const MINUTE = 60_000;
/** One hour in ms. */
export const HOUR = 60 * MINUTE;
/** 24 hours in ms. A calendar day can differ across DST; use `addDays` to step days. */
export const DAY = 24 * HOUR;

/** Length of the shown period. */
export type View = "month" | "week" | "day";
/** `list` is the summary's table tab (kept under its old name so existing URLs still open it). */
export type Layout = "calendar" | "list" | "summary";

/** Local midnight of the day containing `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Adds days. Uses Date's calendar arithmetic rather than fixed 24h steps, so DST shifts are safe. */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Start of the week (Sunday, midnight), as on a wall calendar. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  return addDays(d.getTime(), -d.getDay());
}

/** The displayed period [from, to) and the midnight of each day in it. */
export function rangeOf(view: View, anchor: number): { from: number; to: number; days: number[] } {
  const from =
    view === "month"
      ? startOfMonth(anchor)
      : view === "week"
        ? startOfWeek(anchor)
        : startOfDay(anchor);
  const to = view === "month" ? addMonths(from, 1) : addDays(from, view === "week" ? 7 : 1);
  const days: number[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return { from, to, days };
}

/**
 * The anchor moved one period back or forward. A month keeps the day of the month where it can
 * (clamped at the month's end), so stepping through months and switching to the week view lands
 * near where you were.
 */
export function shift(view: View, anchor: number, dir: -1 | 1): number {
  if (view === "month") return addMonths(anchor, dir);
  return addDays(anchor, (view === "week" ? 7 : 1) * dir);
}

/** Short weekday name in the UI language ("Mon"). */
export function weekday(t: number): string {
  return dateMessages().weekdays[new Date(t).getDay()] ?? "";
}

/** Short weekday names in week order, for column headers (weeks start on Sunday throughout the app). */
export function weekdayHeaders(): string[] {
  return dateMessages().weekdays;
}

/**
 * ISO week number of a Sunday-first week, taken from its Monday: the six days Monday–Saturday
 * share an ISO week, so the number names most of the shown week (the Sunday belongs to the one before).
 */
export function weekNumber(weekStart: number): number {
  return isoWeek(addDays(weekStart, 1));
}

/** Whether both times fall on the same local day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Clock time as "9:05" (24-hour, unpadded hour). */
export function hhmm(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO 8601 week number (weeks start Monday; week 1 contains the year's first Thursday). */
export function isoWeek(t: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getDay() + 6) % 7)) / 7,
    )
  );
}

/**
 * Heading for the period. A week names its first and last day: the summary view has no day columns
 * to say which week it is, and the heading reads the same in both layouts.
 * The year is omitted for the current year (as in `dateLabel`). The week number is not part of the
 * title; the date picker and tooltip show it.
 * Week: { title: "Sep 27 – Oct 3", year: null, week: "W40" }, day: { title: "Oct 5", sub: "Monday", year: null },
 * month: { title: "October", year: null }
 */
export function rangeTitle(
  view: View,
  anchor: number,
  now = Date.now(),
): { title: string; sub: string | null; year: string | null; week: string | null } {
  const { from, to } = rangeOf(view, anchor);
  const a = new Date(from);
  const b = new Date(to - 1);
  const thisYear = new Date(now).getFullYear();
  const year =
    a.getFullYear() === thisYear && b.getFullYear() === thisYear
      ? null
      : b.getFullYear() === a.getFullYear()
        ? String(a.getFullYear())
        : `${a.getFullYear()} – ${b.getFullYear()}`;
  const m = dateMessages();
  if (view === "month") return { title: m.month(a.getMonth()), sub: null, year, week: null };
  if (view === "day")
    return {
      title: m.monthDay(a.getMonth(), a.getDate()),
      sub: m.weekdaysLong[a.getDay()] ?? "",
      year,
      week: null,
    };
  return {
    title: m.weekRange(a.getMonth(), a.getDate(), b.getMonth(), b.getDate()),
    sub: null,
    year,
    week: `W${weekNumber(from)}`,
  };
}

/** Midnight on the first of the month. */
export function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Adds months, clamping to the end of the target month (one month after 1/31 is 2/28). */
export function addMonths(t: number, n: number): number {
  const d = new Date(t);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}

/**
 * One month for the date picker and month view, as Sunday-first weeks padded with days of the adjacent months.
 * It has 4–6 rows depending on the month (the popover height shifts a bit, but that beats empty rows).
 */
export function monthWeeks(month: number): number[][] {
  const first = startOfMonth(month);
  const next = addMonths(first, 1);
  const weeks: number[][] = [];
  for (let w = startOfWeek(first); w < next; w = addDays(w, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return weeks;
}

/** Short date: "Mon, Oct 5". Adds the year when it isn't the current one ("Sun, Oct 5, 2025"). */
export function dateLabel(t: number, now = Date.now()): string {
  const d = new Date(t);
  const year = d.getFullYear() === new Date(now).getFullYear() ? null : d.getFullYear();
  return dateMessages().dateLabel(weekday(t), d.getMonth(), d.getDate(), year);
}

/** "Today" or "Yesterday" when it applies, otherwise null. */
export function relativeDay(t: number, now = Date.now()): string | null {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  const m = dateMessages();
  return diff === 0 ? m.today : diff === 1 ? m.yesterday : null;
}

/** Duration in the UI language ("1h 30m"), rounded to minutes and at least one minute. */
export function durationLabel(ms: number): string {
  const m = Math.max(1, Math.round(ms / MINUTE));
  const msg = dateMessages();
  if (m < 60) return msg.minutes(m);
  const h = Math.floor(m / 60);
  return m % 60 ? msg.hoursMinutes(h, m % 60) : msg.hours(h);
}

/** Date for the URL (YYYY-MM-DD). */
export function toISODate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight of a URL date (YYYY-MM-DD), or null when it isn't one. */
export function fromISODate(s: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

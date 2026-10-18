// A day written the short ways people type it into the palette, in English or Japanese:
// "2026-09-30", "9/30", "9月30日", "today", "昨日", "tue", "last tue", "先週の火曜". Pure, so the
// readings can be tested without a clock.
import { parseIsoDay, startOfDay } from "@shared/dates.ts";
import { addDays, startOfWeek } from "./dates.ts";

/** Days counted back from today, by the words for them. */
const RELATIVE_DAYS: ReadonlyMap<string, number> = new Map([
  ["today", 0],
  ["yesterday", 1],
  ["今日", 0],
  ["きょう", 0],
  ["昨日", 1],
  ["きのう", 1],
  ["一昨日", 2],
  ["おととい", 2],
]);

/** Weekday words (Sunday is 0), English names and their abbreviations, and Japanese ones. */
const WEEKDAYS: readonly RegExp[] = [
  /^(?:sun(?:day)?|日曜(?:日)?)$/,
  /^(?:mon(?:day)?|月曜(?:日)?)$/,
  /^(?:tue(?:s|sday)?|火曜(?:日)?)$/,
  /^(?:wed(?:nesday)?|水曜(?:日)?)$/,
  /^(?:thu(?:rs?|rsday)?|木曜(?:日)?)$/,
  /^(?:fri(?:day)?|金曜(?:日)?)$/,
  /^(?:sat(?:urday)?|土曜(?:日)?)$/,
];

/** "last" in front of a weekday: the one in the week before this one (weeks start on Sunday). */
const LAST_WEEK = /^(?:last\s+|先週の?)/;

/**
 * The day (midnight) `text` names, read against `now`, or null when it names none. A date without
 * a year is the latest one not after today, since the Journal looks back. A bare weekday is the
 * latest one on or before today; "last" before it means that weekday in the previous week.
 */
export function parseDateQuery(text: string, now: number): number | null {
  const q = text.trim().toLowerCase();
  if (q === "") return null;
  const today = startOfDay(now);
  const back = RELATIVE_DAYS.get(q);
  if (back !== undefined) return addDays(today, -back);
  return parseIsoDay(q) ?? monthDay(q, today) ?? weekday(q, today);
}

/** How far back a date without a year is looked for: far enough to reach the last Feb 29. */
const LEAP_CYCLE_YEARS = 8;

/**
 * "9/30" or "9月30日": that day in the latest year it exists in and isn't after today in. Feb 29
 * can be a few years back; a day no month has (2/30, 13/1) is none.
 */
function monthDay(q: string, today: number): number | null {
  const m = /^(\d{1,2})(?:\/|月)(\d{1,2})日?$/.exec(q);
  if (!m) return null;
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  const year = new Date(today).getFullYear();
  for (let y = year; y > year - LEAP_CYCLE_YEARS; y--) {
    const d = new Date(y, month, day);
    // A day past the month's end rolls over into the next month; that year doesn't have it
    if (d.getMonth() === month && d.getTime() <= today) return d.getTime();
  }
  return null;
}

/** "tue", "火曜", "last tue", "先週の火曜": see `parseDateQuery`. */
function weekday(q: string, today: number): number | null {
  const last = LAST_WEEK.test(q);
  const name = q.replace(LAST_WEEK, "");
  const n = WEEKDAYS.findIndex((re) => re.test(name));
  if (n === -1) return null;
  if (last) return addDays(startOfWeek(today), n - 7);
  const ago = (new Date(today).getDay() - n + 7) % 7;
  return addDays(today, -ago);
}

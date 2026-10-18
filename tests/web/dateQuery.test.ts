import { describe, expect, test } from "bun:test";
import { parseDateQuery } from "../../src/web/src/lib/dateQuery.ts";

/** Wednesday, 2026-10-07, mid-afternoon (local time). */
const NOW = new Date(2026, 9, 7, 15, 30).getTime();
/** The local date `d` as written in the tests. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("parseDateQuery", () => {
  test.each<[string, number]>([
    ["2026-09-30", day(2026, 9, 30)],
    ["9/30", day(2026, 9, 30)],
    ["9月30日", day(2026, 9, 30)],
    ["9月30", day(2026, 9, 30)],
    // A date without a year that is still to come this year is last year's
    ["12/24", day(2025, 12, 24)],
    ["today", day(2026, 10, 7)],
    ["Yesterday", day(2026, 10, 6)],
    ["今日", day(2026, 10, 7)],
    ["昨日", day(2026, 10, 6)],
    ["一昨日", day(2026, 10, 5)],
    ["おととい", day(2026, 10, 5)],
  ])("%s", (text, expected) => {
    expect(parseDateQuery(text, NOW)).toBe(expected);
  });

  test("a bare weekday is the latest one on or before today", () => {
    expect(parseDateQuery("wed", NOW)).toBe(day(2026, 10, 7));
    expect(parseDateQuery("Tuesday", NOW)).toBe(day(2026, 10, 6));
    expect(parseDateQuery("thu", NOW)).toBe(day(2026, 10, 1));
    expect(parseDateQuery("火曜", NOW)).toBe(day(2026, 10, 6));
    expect(parseDateQuery("金曜日", NOW)).toBe(day(2026, 10, 2));
  });

  test("last before a weekday is that weekday in the previous week, which starts on Sunday", () => {
    expect(parseDateQuery("last tue", NOW)).toBe(day(2026, 9, 29));
    expect(parseDateQuery("last sat", NOW)).toBe(day(2026, 10, 3));
    expect(parseDateQuery("先週の火曜", NOW)).toBe(day(2026, 9, 29));
    expect(parseDateQuery("先週火曜日", NOW)).toBe(day(2026, 9, 29));
  });

  test("Feb 29 is the last one there was, which can be years back", () => {
    expect(parseDateQuery("2/29", new Date(2028, 0, 10).getTime())).toBe(day(2024, 2, 29));
    expect(parseDateQuery("2/29", new Date(2028, 2, 1).getTime())).toBe(day(2028, 2, 29));
  });

  test("anything else names no day", () => {
    for (const text of ["", "token", "2026-13-45", "2/30", "tues day", "last", "13/1"]) {
      expect(parseDateQuery(text, NOW)).toBeNull();
    }
  });
});

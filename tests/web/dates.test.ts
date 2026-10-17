import { afterEach, describe, expect, test } from "bun:test";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import {
  addDays,
  addMonths,
  dateLabel,
  daysBetween,
  durationLabel,
  elapsedLabel,
  isoWeek,
  monthWeeks,
  periodStart,
  rangeOf,
  rangeTitle,
  relativeDay,
  shift,
  startOfHour,
  startOfMonth,
  startOfWeek,
  timeOrDateTime,
  weekNumber,
  yearUnlessCurrent,
} from "../../src/web/src/lib/dates.ts";
import { DAY0 } from "./helpers.ts";

const DAY = 86_400_000;

describe("dates", () => {
  test("weeks start on Sunday", () => {
    const sunday = addDays(DAY0, -1);
    const saturday = new Date(2026, 9, 10, 15).getTime();
    expect(startOfWeek(saturday)).toBe(sunday);
    expect(startOfWeek(sunday)).toBe(sunday);
    expect(rangeOf("week", saturday)).toMatchObject({ from: sunday, to: addDays(sunday, 7) });
    expect(rangeOf("week", saturday).days).toHaveLength(7);
  });

  test("a Sunday-first week is numbered by its Monday's ISO week", () => {
    // 2027-01-03 (Sun) starts the week of 2027-01-04, ISO week 1; the Sunday alone is in week 53
    expect(weekNumber(new Date(2027, 0, 3).getTime())).toBe(1);
    expect(weekNumber(addDays(DAY0, -1))).toBe(41);
  });

  test("a month runs from the 1st to the 1st of the next, a day per date", () => {
    const { from, to, days } = rangeOf("month", new Date(2026, 1, 14, 9).getTime());
    expect(from).toBe(new Date(2026, 1, 1).getTime());
    expect(to).toBe(new Date(2026, 2, 1).getTime());
    expect(days).toHaveLength(28);
    expect(days.at(-1)).toBe(new Date(2026, 1, 28).getTime());
  });

  test("stepping a month keeps the day of the month, clamped at its end", () => {
    expect(shift("month", new Date(2026, 0, 31).getTime(), 1)).toBe(
      new Date(2026, 1, 28).getTime(),
    );
    expect(shift("month", DAY0, -1)).toBe(new Date(2026, 8, 5).getTime());
    expect(shift("week", DAY0, 1)).toBe(addDays(DAY0, 7));
  });

  test("the period heading names the period and adds the year when it isn't the current one", () => {
    expect(rangeTitle("week", DAY0, DAY0)).toEqual({
      title: "Oct 4 – 10",
      sub: null,
      year: null,
      week: "W41",
    });
    expect(rangeTitle("week", new Date(2026, 8, 30).getTime(), DAY0).title).toBe("Sep 27 – Oct 3");
    expect(rangeTitle("week", DAY0, new Date(2027, 0, 1).getTime()).year).toBe("2026");
    expect(rangeTitle("week", new Date(2026, 11, 30).getTime(), DAY0).year).toBe("2026 – 2027");
    expect(rangeTitle("month", addDays(DAY0, 20), DAY0)).toEqual({
      title: "October",
      sub: null,
      year: null,
      week: null,
    });
    expect(rangeTitle("month", DAY0, new Date(2027, 0, 1).getTime()).year).toBe("2026");
    expect(rangeTitle("day", DAY0, DAY0)).toEqual({
      title: "Oct 5",
      sub: "Monday",
      year: null,
      week: null,
    });
  });

  test("adding months clamps to the end of the target month", () => {
    expect(addMonths(new Date(2026, 0, 31).getTime(), 1)).toBe(new Date(2026, 1, 28).getTime());
    expect(addMonths(new Date(2026, 0, 15).getTime(), -1)).toBe(new Date(2025, 11, 15).getTime());
    expect(startOfMonth(DAY0 + 15 * 3_600_000)).toBe(new Date(2026, 9, 1).getTime());
  });

  test("the start of an hour drops its minutes and seconds", () => {
    expect(startOfHour(new Date(2026, 9, 14, 9, 41, 13).getTime())).toBe(
      new Date(2026, 9, 14, 9).getTime(),
    );
  });

  test("the month grid starts on Sunday and pads weeks with days of adjacent months", () => {
    const weeks = monthWeeks(DAY0);
    // October 2026 starts on a Thursday and ends on a Saturday: 5 weeks from 9/27 (Sun) to 10/31 (Sat)
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe(new Date(2026, 8, 27).getTime());
    expect(weeks.at(-1)?.at(-1)).toBe(new Date(2026, 9, 31).getTime());
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // February 2026 starts on a Sunday and has 28 days: exactly 4 weeks, no padding
    expect(monthWeeks(new Date(2026, 1, 10).getTime())).toHaveLength(4);
    // August 2026 starts on a Saturday: 6 weeks from 7/26 to 9/5
    expect(monthWeeks(new Date(2026, 7, 10).getTime())).toHaveLength(6);
  });

  test("ISO week numbers handle weeks across the year boundary", () => {
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe(53);
    expect(isoWeek(new Date(2024, 11, 30).getTime())).toBe(1);
  });

  test("dates are short, with the year only when it isn't the current one", () => {
    expect(dateLabel(DAY0, DAY0)).toBe("Mon, Oct 5");
    expect(dateLabel(new Date(2025, 9, 5).getTime(), DAY0)).toBe("Sun, Oct 5, 2025");
    expect(relativeDay(DAY0 + 3_600_000, DAY0 + 5 * 3_600_000)).toBe("Today");
    expect(relativeDay(addDays(DAY0, -1), DAY0)).toBe("Yesterday");
    expect(relativeDay(addDays(DAY0, -2), DAY0)).toBeNull();
  });

  test("durations use hours and minutes", () => {
    expect(durationLabel(20_000)).toBe("1m");
    expect(durationLabel(45 * 60_000)).toBe("45m");
    expect(durationLabel(120 * 60_000)).toBe("2h");
    expect(durationLabel(125 * 60_000)).toBe("2h 5m");
  });

  test("elapsed time coarsens to whole hours from 3h and whole days from 24h", () => {
    expect(elapsedLabel(104 * 60_000)).toBe("1h 44m");
    expect(elapsedLabel(3 * 60 * 60_000 - 29_000)).toBe("2h 59m");
    expect(elapsedLabel(3 * 60 * 60_000 + 50 * 60_000)).toBe("3h");
    expect(elapsedLabel((218 * 60 + 28) * 60_000)).toBe("9d");
  });

  test("a time on another day carries its date", () => {
    const morning = DAY0 + (8 * 60 + 43) * 60_000;
    expect(timeOrDateTime(morning, DAY0 + 12 * 60 * 60_000)).toBe("8:43");
    expect(timeOrDateTime(morning, addDays(DAY0, 9))).toBe("Oct 5 8:43");
    expect(timeOrDateTime(morning, addDays(DAY0, 120))).toBe("Oct 5, 2026 8:43");
  });

  describe("in Japanese", () => {
    afterEach(() => setLocale("en"));

    test("headings, dates, and durations use Japanese notation", () => {
      setLocale("ja");
      expect(rangeTitle("week", DAY0, DAY0).title).toBe("10月4日 – 10日");
      expect(rangeTitle("week", new Date(2026, 8, 30).getTime(), DAY0).title).toBe(
        "9月27日 – 10月3日",
      );
      expect(rangeTitle("day", DAY0, DAY0)).toMatchObject({ title: "10月5日", sub: "月曜日" });
      expect(rangeTitle("month", DAY0, DAY0).title).toBe("10月");
      expect(dateLabel(DAY0, DAY0)).toBe("10/5（月）");
      expect(dateLabel(new Date(2025, 9, 5).getTime(), DAY0)).toBe("2025/10/5（日）");
      expect(relativeDay(DAY0, DAY0)).toBe("今日");
      expect(relativeDay(addDays(DAY0, -1), DAY0)).toBe("昨日");
      expect(durationLabel(125 * 60_000)).toBe("2時間5分");
      expect(durationLabel(120 * 60_000)).toBe("2時間");
      expect(durationLabel(45 * 60_000)).toBe("45分");
      expect(elapsedLabel(2 * 24 * 60 * 60_000)).toBe("2日");
      expect(timeOrDateTime(DAY0, addDays(DAY0, 1))).toBe("10/5 0:00");
      expect(timeOrDateTime(DAY0, addDays(DAY0, 120))).toBe("2026/10/5 0:00");
    });
  });
});

describe("isoWeek", () => {
  /** The arithmetic isoWeek used before it was split into named steps. */
  function reference(t: number): number {
    const d = new Date(new Date(t).setHours(0, 0, 0, 0));
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return (
      1 + Math.round(((d.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7)
    );
  }

  test("numbers every day of several years as before", () => {
    for (
      let t = new Date(2023, 11, 1).getTime();
      t < new Date(2028, 1, 1).getTime();
      t = addDays(t, 1)
    )
      expect(isoWeek(t)).toBe(reference(t));
  });
});

describe("periodStart", () => {
  test("starts a month on the 1st, a week on Sunday and a day at midnight", () => {
    const t = new Date(2026, 9, 7, 15).getTime(); // Wed
    expect(periodStart("month", t)).toBe(new Date(2026, 9, 1).getTime());
    expect(periodStart("week", t)).toBe(addDays(DAY0, -1));
    expect(periodStart("day", t)).toBe(new Date(2026, 9, 7).getTime());
  });
});

describe("yearUnlessCurrent", () => {
  test("leaves the current year out", () => {
    expect(yearUnlessCurrent(DAY0, addDays(DAY0, 30))).toBeNull();
    expect(yearUnlessCurrent(DAY0, addDays(DAY0, 120))).toBe(2026);
  });
});

describe("daysBetween", () => {
  test("counts whole days between the two days", () => {
    expect(daysBetween(DAY0, addDays(DAY0, 1) + 9 * 3_600_000)).toBe(1);
    expect(daysBetween(DAY0, addDays(DAY0, 3) + 23 * 3_600_000)).toBe(3);
    expect(daysBetween(DAY0, DAY0 + 10 * 3_600_000)).toBe(0);
  });
});

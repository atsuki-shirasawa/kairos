import { afterEach, describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import {
  addDays,
  addMonths,
  dateLabel,
  durationLabel,
  isoWeek,
  monthWeeks,
  rangeOf,
  rangeTitle,
  relativeDay,
  startOfMonth,
  startOfWeek,
} from "../../src/web/src/lib/dates.ts";
import {
  blocksOfDay,
  busyMs,
  columnTracks,
  isMark,
  layoutDay,
  recordedDays,
} from "../../src/web/src/lib/layout.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const at = (h: number) => DAY0 + h * 3_600_000;

function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => ({
    start,
    end,
    headline: id,
    summarized: false,
    body: null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: {
      commits: 0,
      prs: 0,
      merges: 0,
      filesEdited: 0,
      toolCalls: 0,
      subagents: 0,
      toolErrors: 0,
      interrupts: 0,
      apiErrors: 0,
      compactions: 0,
      claudeMs: null,
      effort: null,
    },
  }));
  return {
    id,
    projectId: 1,
    label: null,
    branch: null,
    scheduledRuns: 0,
    continued: false,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments,
  };
}

/** Per block: [column, column count, span, stacking depth]. */
const placement = (blocks: ReturnType<typeof layoutDay>) =>
  Object.fromEntries(
    blocks.map((b) => [
      `${b.session.id}@${(b.start / 3_600_000).toFixed(2)}`,
      [b.col, b.cols, b.span, b.depth],
    ]),
  );

describe("layoutDay", () => {
  test("blocks that don't overlap each take the full width", () => {
    const blocks = layoutDay([session("a", [at(9), at(10)]), session("b", [at(11), at(12)])], DAY0);
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 1, 1, 0], "b@11.00": [0, 1, 1, 0] });
  });

  test("blocks starting at least one heading line apart stack in the same column instead of splitting", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(10), at(11)]),
        session("c", [at(11.5), at(13)]),
        session("d", [at(15), at(16)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "a@9.00": [0, 1, 1, 0],
      "b@10.00": [0, 1, 1, 1],
      // b visually ends at 11:00 too, so it stacks one level over a
      "c@11.50": [0, 1, 1, 1],
      "d@15.00": [0, 1, 1, 0],
    });
    // a's heading must fit before 10:00, where b starts covering it
    expect(blocks.find((b) => b.session.id === "a")?.coveredFrom).toBe(10 * 3_600_000);
    expect(blocks.find((b) => b.session.id === "c")?.coveredFrom).toBeNull();
  });

  test("blocks split side by side only when they start almost together and headings would collide", () => {
    const blocks = layoutDay(
      [
        session("long", [at(9), at(12)]),
        session("x", [at(10), at(10.25)]),
        session("y", [at(10.1), at(10.5)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "long@9.00": [0, 2, 1, 0],
      "x@10.00": [0, 2, 1, 1],
      "y@10.10": [1, 2, 1, 0],
    });
  });

  test("short blocks count as overlapping for their minimum drawn height", () => {
    // Ten minutes is a card, drawn 25 minutes tall, so b starting 12 minutes later sits beside it
    const blocks = layoutDay(
      [session("a", [at(9), at(9 + 10 / 60)]), session("b", [at(9.2), at(9.4)])],
      DAY0,
    );
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 2, 1, 0], "b@9.20": [1, 2, 1, 0] });
  });

  test("work under ten minutes becomes a mark and takes no column", () => {
    const blocks = layoutDay(
      [session("long", [at(9), at(12)]), session("quick", [at(10), at(10.1)])],
      DAY0,
    );
    expect(placement(blocks)).toEqual({ "long@9.00": [0, 1, 1, 0], "quick@10.00": [0, 1, 1, 0] });
    expect(Object.fromEntries(blocks.map((b) => [b.session.id, b.mark]))).toEqual({
      long: false,
      quick: true,
    });
    // A mark never covers the card it sits beside
    expect(blocks.find((b) => b.session.id === "long")?.coveredFrom).toBeNull();
  });

  test("picks the column with the fewest blocks underneath and widens into free columns on the right", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(9.05), at(9.3)]),
        session("c", [at(9.1), at(9.35)]),
        session("d", [at(10), at(10.5)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "a@9.00": [0, 3, 1, 0],
      "b@9.05": [1, 3, 1, 0],
      "c@9.10": [2, 3, 1, 0],
      // Rather than stacking over a, use the column b freed up and widen into c's column
      "d@10.00": [1, 3, 2, 0],
    });
  });

  test("blocks spanning midnight are clipped per day", () => {
    const s = session("late", [at(23), at(25)]);
    const today = layoutDay([s], DAY0);
    const tomorrow = layoutDay([s], DAY0 + 86_400_000);
    expect(today[0]).toMatchObject({
      start: 23 * 3_600_000,
      end: 86_400_000,
      continuesAfter: true,
      continuesBefore: false,
    });
    expect(tomorrow[0]).toMatchObject({
      start: 0,
      end: 3_600_000,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(tomorrow[0]?.dayStart).toBe(DAY0 + 86_400_000);
  });
});

describe("recordedDays", () => {
  const days = [0, 1, 2].map((i) => addDays(DAY0, i));

  test("blocks spanning midnight count on both days, and like the calendar, one ending exactly at midnight counts on the next day", () => {
    const spans = [
      { start: at(23), end: at(25), projectId: 1 },
      { start: at(40), end: at(48), projectId: 1 },
    ];
    expect([...recordedDays(spans, days)]).toEqual(days);
    expect(blocksOfDay([session("a", [at(40), at(48)])], addDays(DAY0, 2))).toHaveLength(1);
  });

  test("blocks of hidden projects don't count", () => {
    const spans = [
      { start: at(1), end: at(2), projectId: 1 },
      { start: at(25), end: at(26), projectId: 2 },
      { start: at(49), end: at(50), projectId: null },
    ];
    expect([...recordedDays(spans, days, new Set([2]))]).toEqual([DAY0, addDays(DAY0, 2)]);
  });
});

describe("dates", () => {
  test("weeks start on Monday", () => {
    const sunday = new Date(2026, 9, 11, 15).getTime();
    expect(startOfWeek(sunday)).toBe(DAY0);
    expect(rangeOf("week", sunday)).toMatchObject({ from: DAY0, to: addDays(DAY0, 7) });
    expect(rangeOf("week", sunday).days).toHaveLength(7);
  });

  test("the period heading leads with the month and adds the year when it isn't the current one", () => {
    expect(rangeTitle("week", DAY0, DAY0)).toEqual({
      title: "October",
      sub: null,
      year: null,
      week: "W41",
    });
    expect(rangeTitle("week", new Date(2026, 8, 30).getTime(), DAY0).title).toBe("Sep – Oct");
    expect(rangeTitle("week", DAY0, new Date(2027, 0, 1).getTime()).year).toBe("2026");
    expect(rangeTitle("week", new Date(2026, 11, 30).getTime(), DAY0).year).toBe("2026 – 2027");
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

  test("the month grid starts on Monday and pads weeks with days of adjacent months", () => {
    const weeks = monthWeeks(DAY0);
    // October 2026 starts on a Thursday and ends on a Saturday: 5 weeks from 9/28 (Mon) to 11/1 (Sun)
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe(new Date(2026, 8, 28).getTime());
    expect(weeks.at(-1)?.at(-1)).toBe(new Date(2026, 10, 1).getTime());
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // February 2026 starts on a Sunday: a week holding only 2/1 comes first, 5 weeks from 1/26 to 3/1
    expect(monthWeeks(new Date(2026, 1, 10).getTime())).toHaveLength(5);
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

  describe("in Japanese", () => {
    afterEach(() => setLocale("en"));

    test("headings, dates, and durations use Japanese notation", () => {
      setLocale("ja");
      expect(rangeTitle("week", DAY0, DAY0).title).toBe("10月");
      expect(rangeTitle("week", new Date(2026, 8, 30).getTime(), DAY0).title).toBe("9月 – 10月");
      expect(rangeTitle("day", DAY0, DAY0)).toMatchObject({ title: "10月5日", sub: "月曜日" });
      expect(dateLabel(DAY0, DAY0)).toBe("10/5 月");
      expect(dateLabel(new Date(2025, 9, 5).getTime(), DAY0)).toBe("2025/10/5 日");
      expect(relativeDay(DAY0, DAY0)).toBe("今日");
      expect(relativeDay(addDays(DAY0, -1), DAY0)).toBe("昨日");
      expect(durationLabel(125 * 60_000)).toBe("2時間5分");
      expect(durationLabel(120 * 60_000)).toBe("2時間");
      expect(durationLabel(45 * 60_000)).toBe("45分");
    });
  });
});

describe("blocksOfDay", () => {
  test("blocks spanning midnight are clipped per day and marked as continuing", () => {
    const s = session("a", [at(22), at(26)]);
    const [today] = blocksOfDay([s], DAY0);
    const [tomorrow] = blocksOfDay([s], addDays(DAY0, 1));
    expect([today?.start, today?.end, today?.continuesBefore, today?.continuesAfter]).toEqual([
      22 * 3_600_000,
      24 * 3_600_000,
      false,
      true,
    ]);
    expect([tomorrow?.start, tomorrow?.end, tomorrow?.continuesBefore]).toEqual([
      0,
      2 * 3_600_000,
      true,
    ]);
  });

  test("blocks are sorted by start across sessions", () => {
    const blocks = blocksOfDay(
      [session("a", [at(9), at(10)], [at(14), at(15)]), session("b", [at(11), at(12)])],
      DAY0,
    );
    expect(blocks.map((b) => `${b.session.id}@${b.start / 3_600_000}`)).toEqual([
      "a@9",
      "b@11",
      "a@14",
    ]);
  });
});

describe("busyMs", () => {
  test("overlaps between parallel blocks count once", () => {
    const h = 3_600_000;
    expect(
      busyMs([
        { start: 9 * h, end: 11 * h },
        { start: 10 * h, end: 12 * h },
        { start: 14 * h, end: 15 * h },
      ]),
    ).toBe(4 * h);
  });

  test("zero without blocks", () => {
    expect(busyMs([])).toBe(0);
  });
});

describe("columnTracks", () => {
  const fr = (track: string) => Number(/([\d.]+)fr\)$/.exec(track)?.[1]);

  test("all days even when there is no work", () => {
    expect(columnTracks([0, 0, 0], 700, -1)).toEqual(Array(3).fill("minmax(0, 1fr)"));
  });

  test("days with parallel work get more width; days without work stay narrow", () => {
    const tracks = columnTracks([1, 4, 0], 2000, -1);
    expect(fr(tracks[1] ?? "")).toBeGreaterThan(fr(tracks[0] ?? ""));
    expect(tracks[2]).toBe("minmax(2.5rem, 0.15fr)");
  });

  test("with lanes too narrow, the selected day and its neighbors keep their width", () => {
    const wide = columnTracks([2, 4, 2, 1, 1, 1, 1], 3000, 1);
    expect(wide.every((t) => t.startsWith("minmax(0,"))).toBe(true);
    const narrow = columnTracks([2, 4, 2, 1, 1, 1, 1], 900, 1);
    expect(narrow[1]).toBe("minmax(0, 2.5fr)");
    expect(fr(narrow[0] ?? "")).toBeLessThan(fr(wide[0] ?? ""));
    expect(narrow.slice(3)).toEqual(Array(4).fill("minmax(2.5rem, 0.25fr)"));
  });

  test("without a selection, narrow lanes leave the weights as they are", () => {
    expect(columnTracks([2, 4, 2, 1, 1, 1, 1], 900, -1)).toEqual(
      columnTracks([2, 4, 2, 1, 1, 1, 1], 3000, -1),
    );
  });
});

describe("isMark", () => {
  const DAY = 86_400_000;
  const block = (s: CalendarSession, i = 0) => ({
    session: s,
    segment: s.segments[i] ?? s.segments[0]!,
  });

  test("short work is a mark; ten minutes or more is a card", () => {
    expect(isMark(block(session("q", [at(9), at(9.15)])))).toBe(true);
    expect(isMark(block(session("w", [at(9), at(9 + 10 / 60)])))).toBe(false);
  });

  test("judges a block crossing midnight by its whole length", () => {
    const s = session("late", [at(23.9), at(24.5)]);
    expect(isMark(block(s))).toBe(false);
    expect(layoutDay([s], DAY0 + DAY)[0]?.mark).toBe(false);
  });

  test("the work in progress stays a card while it is still short", () => {
    const s = { ...session("now", [at(8), at(9)], [at(10), at(10.05)]), active: true };
    expect(isMark(block(s, 1))).toBe(false);
    // Its earlier short block, if any, would still be a mark; here the first is an hour long
    expect(isMark(block(s, 0))).toBe(false);
  });
});

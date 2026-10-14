import { describe, expect, test } from "bun:test";
import { addDays } from "../../src/web/src/lib/dates.ts";
import { blocksOfDay, busyMs, overlaps, recordedDays } from "../../src/web/src/lib/dayBlocks.ts";
import { at, DAY0, session } from "./helpers.ts";

describe("overlaps", () => {
  test("work ending exactly at the period's start still counts; work starting at its end doesn't", () => {
    expect(overlaps({ start: at(22), end: at(24) }, at(24), at(48))).toBe(true);
    expect(overlaps({ start: at(48), end: at(49) }, at(24), at(48))).toBe(false);
    expect(overlaps({ start: at(20), end: at(23) }, at(24), at(48))).toBe(false);
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

import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { addDays, rangeLabel, rangeOf, startOfWeek } from "../../src/web/src/lib/dates.ts";
import { layoutDay } from "../../src/web/src/lib/layout.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05（月）0 時
const at = (h: number) => DAY0 + h * 3_600_000;

function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => ({ start, end, headline: id, summarized: false }));
  return {
    id,
    projectId: 1,
    label: null,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments,
  };
}

const cols = (blocks: ReturnType<typeof layoutDay>) =>
  Object.fromEntries(
    blocks.map((b) => [`${b.session.id}@${(b.start / 3_600_000).toFixed(1)}`, [b.col, b.cols]]),
  );

describe("layoutDay", () => {
  test("重ならないブロックはそれぞれ全幅", () => {
    const blocks = layoutDay([session("a", [at(9), at(10)]), session("b", [at(11), at(12)])], DAY0);
    expect(cols(blocks)).toEqual({ "a@9.0": [0, 1], "b@11.0": [0, 1] });
  });

  test("重なるブロックは横に並べ、重なりのまとまりごとに列数を決める", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(10), at(11)]),
        session("c", [at(11.5), at(13)]),
        session("d", [at(15), at(16)]),
      ],
      DAY0,
    );
    expect(cols(blocks)).toEqual({
      "a@9.0": [0, 2],
      "b@10.0": [1, 2],
      "c@11.5": [1, 2],
      "d@15.0": [0, 1],
    });
  });

  test("短いブロックも最低限の高さぶん重なりとして扱う", () => {
    const blocks = layoutDay(
      [session("a", [at(9), at(9)]), session("b", [at(9.1), at(9.2)])],
      DAY0,
    );
    expect(cols(blocks)).toEqual({ "a@9.0": [0, 2], "b@9.1": [1, 2] });
  });

  test("日をまたぐブロックは日ごとに切る", () => {
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

describe("dates", () => {
  test("週は月曜から始まる", () => {
    const sunday = new Date(2026, 9, 11, 15).getTime();
    expect(startOfWeek(sunday)).toBe(DAY0);
    expect(rangeOf("week", sunday)).toMatchObject({ from: DAY0, to: addDays(DAY0, 7) });
    expect(rangeOf("week", sunday).days).toHaveLength(7);
  });

  test("期間の見出し", () => {
    expect(rangeLabel("week", DAY0)).toBe("2026年10月5日 – 11日");
    expect(rangeLabel("week", new Date(2026, 8, 30).getTime())).toBe("2026年9月28日 – 10月4日");
    expect(rangeLabel("day", DAY0)).toBe("2026年10月5日（月）");
  });
});

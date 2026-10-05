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

/** ブロックごとの [列, 列数, 広げる列数, 重なりの深さ]。 */
const placement = (blocks: ReturnType<typeof layoutDay>) =>
  Object.fromEntries(
    blocks.map((b) => [
      `${b.session.id}@${(b.start / 3_600_000).toFixed(2)}`,
      [b.col, b.cols, b.span, b.depth],
    ]),
  );

describe("layoutDay", () => {
  test("重ならないブロックはそれぞれ全幅", () => {
    const blocks = layoutDay([session("a", [at(9), at(10)]), session("b", [at(11), at(12)])], DAY0);
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 1, 1, 0], "b@11.00": [0, 1, 1, 0] });
  });

  test("開始が見出し 1 行ぶん以上離れていれば、横に分けずに同じ列へずらして重ねる", () => {
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
      // b は見た目の上でも 11 時に終わっているので、a の上に 1 段だけ重ねる
      "c@11.50": [0, 1, 1, 1],
      "d@15.00": [0, 1, 1, 0],
    });
    // a の見出しは、b が重なり始める 10 時までに収める
    expect(blocks.find((b) => b.session.id === "a")?.coveredFrom).toBe(10 * 3_600_000);
    expect(blocks.find((b) => b.session.id === "c")?.coveredFrom).toBeNull();
  });

  test("開始がほぼ同時で見出しがぶつかるときだけ横に分ける", () => {
    const blocks = layoutDay(
      [
        session("long", [at(9), at(12)]),
        session("x", [at(10), at(10.1)]),
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

  test("短いブロックも最低限の高さぶん重なりとして扱う", () => {
    const blocks = layoutDay(
      [session("a", [at(9), at(9)]), session("b", [at(9.1), at(9.2)])],
      DAY0,
    );
    expect(placement(blocks)).toEqual({ "a@9.00": [0, 2, 1, 0], "b@9.10": [1, 2, 1, 0] });
  });

  test("下に残るブロックが少ない列を選び、右の列が空いていればそこまで広げる", () => {
    const blocks = layoutDay(
      [
        session("a", [at(9), at(12)]),
        session("b", [at(9.05), at(9.2)]),
        session("c", [at(9.1), at(9.3)]),
        session("d", [at(10), at(10.5)]),
      ],
      DAY0,
    );
    expect(placement(blocks)).toEqual({
      "a@9.00": [0, 3, 1, 0],
      "b@9.05": [1, 3, 1, 0],
      "c@9.10": [2, 3, 1, 0],
      // a の上に重ねるより、b が終わって空いた列に置き、c の列まで広げる
      "d@10.00": [1, 3, 2, 0],
    });
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

import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import {
  addDays,
  addMonths,
  dateLabel,
  isoWeek,
  monthWeeks,
  rangeOf,
  rangeTitle,
  relativeDay,
  startOfMonth,
  startOfWeek,
} from "../../src/web/src/lib/dates.ts";
import { blocksOfDay, busyMs, layoutDay, recordedDays } from "../../src/web/src/lib/layout.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05（月）0 時
const at = (h: number) => DAY0 + h * 3_600_000;

function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => ({
    start,
    end,
    headline: id,
    summarized: false,
    promptCount: 1,
    usage: null,
    activity: {
      commits: 0,
      prs: 0,
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

describe("recordedDays", () => {
  const days = [0, 1, 2].map((i) => addDays(DAY0, i));

  test("日をまたぐブロックは両方の日に数え、カレンダーと同じく 0 時ちょうどに終わるものも翌日に数える", () => {
    const spans = [
      { start: at(23), end: at(25), projectId: 1 },
      { start: at(40), end: at(48), projectId: 1 },
    ];
    expect([...recordedDays(spans, days)]).toEqual(days);
    expect(blocksOfDay([session("a", [at(40), at(48)])], addDays(DAY0, 2))).toHaveLength(1);
  });

  test("非表示のプロジェクトのブロックは数えない", () => {
    const spans = [
      { start: at(1), end: at(2), projectId: 1 },
      { start: at(25), end: at(26), projectId: 2 },
      { start: at(49), end: at(50), projectId: null },
    ];
    expect([...recordedDays(spans, days, new Set([2]))]).toEqual([DAY0, addDays(DAY0, 2)]);
  });
});

describe("dates", () => {
  test("週は月曜から始まる", () => {
    const sunday = new Date(2026, 9, 11, 15).getTime();
    expect(startOfWeek(sunday)).toBe(DAY0);
    expect(rangeOf("week", sunday)).toMatchObject({ from: DAY0, to: addDays(DAY0, 7) });
    expect(rangeOf("week", sunday).days).toHaveLength(7);
  });

  test("期間の見出しは月を主役にし、年は今年でなければ添える", () => {
    expect(rangeTitle("week", DAY0, DAY0)).toEqual({
      title: "10月",
      sub: null,
      year: null,
      week: "W41",
    });
    expect(rangeTitle("week", new Date(2026, 8, 30).getTime(), DAY0).title).toBe("9月 – 10月");
    expect(rangeTitle("week", DAY0, new Date(2027, 0, 1).getTime()).year).toBe("2026");
    expect(rangeTitle("week", new Date(2026, 11, 30).getTime(), DAY0).year).toBe("2026 – 2027");
    expect(rangeTitle("day", DAY0, DAY0)).toEqual({
      title: "10月5日",
      sub: "月曜日",
      year: null,
      week: null,
    });
  });

  test("月を足すと、月末は移った先の月末に丸める", () => {
    expect(addMonths(new Date(2026, 0, 31).getTime(), 1)).toBe(new Date(2026, 1, 28).getTime());
    expect(addMonths(new Date(2026, 0, 15).getTime(), -1)).toBe(new Date(2025, 11, 15).getTime());
    expect(startOfMonth(DAY0 + 15 * 3_600_000)).toBe(new Date(2026, 9, 1).getTime());
  });

  test("月のグリッドは月曜始まりで、前後の月の日で週を埋める", () => {
    const weeks = monthWeeks(DAY0);
    // 2026 年 10 月は木曜始まり・土曜終わり。9/28（月）〜 11/1（日）の 5 週
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe(new Date(2026, 8, 28).getTime());
    expect(weeks.at(-1)?.at(-1)).toBe(new Date(2026, 10, 1).getTime());
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 2026 年 2 月は日曜始まり。2/1 だけの週が先頭に来て、1/26 〜 3/1 の 5 週
    expect(monthWeeks(new Date(2026, 1, 10).getTime())).toHaveLength(5);
  });

  test("ISO 週番号は年をまたぐ週も正しく数える", () => {
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe(53);
    expect(isoWeek(new Date(2024, 11, 30).getTime())).toBe(1);
  });

  test("日付は短く書き、今年でなければ年を付ける", () => {
    expect(dateLabel(DAY0, DAY0)).toBe("10/5 月");
    expect(dateLabel(new Date(2025, 9, 5).getTime(), DAY0)).toBe("2025/10/5 日");
    expect(relativeDay(DAY0 + 3_600_000, DAY0 + 5 * 3_600_000)).toBe("今日");
    expect(relativeDay(addDays(DAY0, -1), DAY0)).toBe("昨日");
    expect(relativeDay(addDays(DAY0, -2), DAY0)).toBeNull();
  });
});

describe("blocksOfDay", () => {
  test("日をまたぐブロックは日ごとに切り、続きの印を付ける", () => {
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

  test("セッションをまたいで開始順に並べる", () => {
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
  test("並行したブロックの重なりは 1 回だけ数える", () => {
    const h = 3_600_000;
    expect(
      busyMs([
        { start: 9 * h, end: 11 * h },
        { start: 10 * h, end: 12 * h },
        { start: 14 * h, end: 15 * h },
      ]),
    ).toBe(4 * h);
  });

  test("ブロックがなければ 0", () => {
    expect(busyMs([])).toBe(0);
  });
});

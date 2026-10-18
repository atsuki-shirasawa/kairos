import { describe, expect, test } from "bun:test";
import { blocksOfDay } from "../../src/web/src/lib/dayBlocks.ts";
import {
  assignLanes,
  type DayRow,
  dayRows,
  type LaneMark,
  laneLooks,
} from "../../src/web/src/lib/dayRows.ts";
import { at, DAY0, H, session } from "./helpers.ts";

/** Each row as text: a block by its session and lane marks, a quiet row by its length in hours. */
function sketch(rows: DayRow[]): string[] {
  const mark = (m: LaneMark) =>
    m.kind === "none"
      ? "."
      : m.kind === "through"
        ? "|"
        : m.kind === "end"
          ? "'"
          : `${m.above ? "'" : ""}o${m.below ? "," : ""}`;
  return rows.map((r) =>
    r.kind === "quiet"
      ? `quiet ${Math.round((r.ms / H) * 10) / 10}h ${r.lanes.map(mark).join(" ")}`
      : `${r.blocks[0]?.session.id} ${r.lanes.map(mark).join(" ")}`,
  );
}

const rowsOf = (...sessions: ReturnType<typeof session>[]) => dayRows(blocksOfDay(sessions, DAY0));

describe("assignLanes", () => {
  test("sessions at the same time get lanes side by side, and a lane is reused once free", () => {
    const spans = new Map([
      ["a", { start: 9 * H, end: 12 * H }],
      ["b", { start: 10 * H, end: 11 * H }],
      ["c", { start: 11 * H, end: 13 * H }],
      ["d", { start: 12 * H, end: 14 * H }],
    ]);
    const { lanes, count } = assignLanes(spans);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, c: 1, d: 0 });
    expect(count).toBe(2);
  });
});

describe("dayRows", () => {
  test("parallel sessions draw as parallel lines, each running until its work ends", () => {
    const rows = rowsOf(
      session("a", [at(9), at(10)], [at(10.25), at(11)]),
      session("b", [at(9.5), at(10.5)]),
    );
    expect(rows.every((r) => r.lanes.length === 2)).toBe(true);
    // b is still working when a's second block starts, so its line reaches that row
    expect(sketch(rows)).toEqual(["a o, .", "b | o,", "a 'o '"]);
  });

  test("a gap of half an hour or more with no work becomes one quiet row, crossed by a session still going", () => {
    const rows = rowsOf(
      session("a", [at(9), at(10)], [at(13), at(14)]),
      session("b", [at(10.1), at(10.3)]),
    );
    expect(sketch(rows)).toEqual(["a o, .", "b | o", "quiet 2.7h | .", "a 'o ."]);
  });

  test("a long block's line runs past the work that started while it ran", () => {
    const rows = rowsOf(
      session("a", [at(9), at(17)]),
      session("b", [at(10), at(11)]),
      session("c", [at(13), at(14)]),
    );
    expect(sketch(rows)).toEqual(["a o, .", "b | o", "c ' o"]);
  });

  test("work running in from the previous day keeps its line to the top", () => {
    const rows = rowsOf(session("a", [at(-1), at(1)]), session("b", [at(5), at(6)]));
    expect(sketch(rows)[0]).toBe("a 'o");
  });

  test("a burst of headless runs is one row, as it is one mark on the calendar", () => {
    const runs = [0, 1, 2].map((i) => {
      const s = session(`run${i}`, [at(9 + i / 60), at(9 + (i + 0.5) / 60)]);
      return { ...s, headless: true };
    });
    const rows = rowsOf(...runs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind === "block" && rows[0].blocks.map((b) => b.session.id)).toEqual([
      "run0",
      "run1",
      "run2",
    ]);
  });
});

describe("laneLooks", () => {
  test("a session's lane takes its project's color, and is dashed when it ran headless", () => {
    const projects = new Map([[1, { id: 1, color: "p3" } as never]]);
    const looks = laneLooks([{ ...session("a", [at(9), at(10)]), headless: true }], projects);
    expect(looks.get("a")).toEqual({ color: "var(--p3)", headless: true });
  });
});

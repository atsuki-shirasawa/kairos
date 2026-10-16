import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import {
  joinSessions,
  monthCellFit,
  monthEdges,
  monthRowHeights,
  splitCellBlocks,
  withEdgeSessions,
} from "../../src/web/src/lib/monthGrid.ts";
import { at, DAY0, H, session } from "./helpers.ts";

describe("splitCellBlocks", () => {
  /** A block starting at hour `h`; `headless` runs of one project seconds apart group up. */
  const cellBlock = (id: string, h: number, mark: boolean, headless = false) => ({
    session: { id, projectId: 1, headless } as CalendarSession,
    segment: {
      start: DAY0 + h * H,
      end: DAY0 + h * H + 5_000,
    } as CalendarSession["segments"][number],
    mark,
  });
  const ids = (list: { session: { id: string } }[]) => list.map((b) => b.session.id);

  test("puts marks beside the date and longer work in the lines", () => {
    const blocks = [cellBlock("a", 9, true), cellBlock("b", 10, false), cellBlock("c", 11, true)];
    const { marks, lines } = splitCellBlocks(blocks, 6);
    expect(marks.map(ids)).toEqual([["a"], ["c"]]);
    expect(ids(lines)).toEqual(["b"]);
  });

  test("groups a burst of headless runs into one mark", () => {
    const blocks = [cellBlock("a", 9, true, true), cellBlock("b", 9.001, true, true)];
    expect(splitCellBlocks(blocks, 6).marks.map(ids)).toEqual([["a", "b"]]);
  });

  test("moves marks past the limit into the lines, keeping time order", () => {
    const blocks = [
      cellBlock("a", 9, true),
      cellBlock("b", 10, true),
      cellBlock("c", 11, false),
      cellBlock("d", 12, true),
    ];
    const { marks, lines } = splitCellBlocks(blocks, 1);
    expect(marks.map(ids)).toEqual([["a"]]);
    expect(ids(lines)).toEqual(["b", "c", "d"]);
  });
});

describe("monthCellFit", () => {
  test("lists every block when they fit", () => {
    expect(monthCellFit(3, 3)).toEqual({ shown: 3, more: 0 });
    expect(monthCellFit(0, 2)).toEqual({ shown: 0, more: 0 });
  });

  test("gives the last line to +n more when they don't, counting what it stands for", () => {
    expect(monthCellFit(5, 3)).toEqual({ shown: 2, more: 3 });
    expect(monthCellFit(2, 1)).toEqual({ shown: 0, more: 2 });
    expect(monthCellFit(2, 0)).toEqual({ shown: 0, more: 2 });
  });
});

describe("monthRowHeights", () => {
  const sizes = { heightPx: 600, minBusyPx: 94, emptyPx: 36 };

  test("shrinks weeks without work and gives their room to the weeks with work", () => {
    expect(monthRowHeights([false, true, false, true, false], sizes)).toEqual([
      36, 246, 36, 246, 36,
    ]);
  });

  test("splits the height evenly when no week has work", () => {
    expect(monthRowHeights([false, false, false, false, false], sizes)).toEqual([
      120, 120, 120, 120, 120,
    ]);
  });

  test("keeps weeks with work at their minimum once the month runs out of room", () => {
    const rows = monthRowHeights([true, true, true, true, true, false], {
      ...sizes,
      heightPx: 300,
    });
    expect(rows).toEqual([94, 94, 94, 94, 94, 36]);
  });
});

describe("monthEdges", () => {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

  test("covers the adjacent months' days in the first and last weeks", () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday
    expect(monthEdges(day(2026, 9, 15))).toEqual({
      before: { from: day(2026, 8, 30), to: day(2026, 9, 1) },
      after: { from: day(2026, 10, 1), to: day(2026, 10, 4) },
    });
  });

  test("has no range on a side the month fills by itself", () => {
    // February 2026 starts on a Sunday and ends on a Saturday
    expect(monthEdges(day(2026, 2, 10))).toEqual({ before: null, after: null });
  });
});

describe("joinSessions", () => {
  test("keeps one copy of a session found in two ranges, with the blocks of both", () => {
    const night = session("n", [at(-2), at(-1)], [at(23), at(25)]);
    const inMonth = { ...night, segments: night.segments.slice(0, 1) };
    const inEdge = { ...night, segments: night.segments.slice(1) };
    const joined = joinSessions([[inMonth], [inEdge]]);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.segments.map((g) => g.start)).toEqual([at(-2), at(23)]);
  });

  test("lists a block that crosses midnight once", () => {
    const crossing = session("c", [at(23), at(25)]);
    expect(joinSessions([[crossing], [crossing]])[0]?.segments).toHaveLength(1);
  });

  test("orders sessions by start across the ranges", () => {
    const early = session("early", [at(-30), at(-29)]);
    const late = session("late", [at(30), at(31)]);
    const mid = session("mid", [at(1), at(2)]);
    expect(joinSessions([[mid], [early], [late]]).map((s) => s.id)).toEqual([
      "early",
      "mid",
      "late",
    ]);
  });
});

describe("withEdgeSessions", () => {
  test("hands back the month's own list when the edges hold no work", () => {
    const visible = [session("a", [at(1), at(2)])];
    expect(withEdgeSessions(visible, [[], []])).toBe(visible);
  });

  test("adds the edges' work otherwise", () => {
    const visible = [session("a", [at(1), at(2)])];
    const edge = session("b", [at(30), at(31)]);
    expect(withEdgeSessions(visible, [[], [edge]]).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

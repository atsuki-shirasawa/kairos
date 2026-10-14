import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { monthCellFit, monthRowHeights, splitCellBlocks } from "../../src/web/src/lib/monthGrid.ts";
import { DAY0, H } from "./helpers.ts";

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

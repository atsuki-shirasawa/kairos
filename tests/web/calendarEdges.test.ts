import { describe, expect, test } from "bun:test";
import { findEdges, NO_EDGES, sameEdges } from "../../src/web/src/lib/calendarEdges.ts";
import { DAY0, H } from "./helpers.ts";

const DAY1 = new Date(2026, 9, 6).getTime();

/** A block of [startHour, endHour] since midnight on `dayStart`. */
const timed = (start: number, end: number, dayStart = DAY0) => ({
  dayStart,
  start: start * H,
  end: end * H,
});

describe("findEdges", () => {
  // 50px per hour, viewing 08:00–20:00
  const view = { scrollTop: 400, heightPx: 600, hourPx: 50 };

  test("nothing out of view", () => {
    expect(findEdges([timed(9, 10), timed(18, 19)], view)).toEqual(NO_EDGES);
  });

  test("points at the nearest block on each side, counting every day", () => {
    const blocks = [timed(1, 2), timed(5, 6, DAY1), timed(21, 22), timed(23, 23.5, DAY1)];
    const edges = findEdges(blocks, view);
    expect(edges.above).toEqual({ count: 2, time: DAY1 + 6 * H, scrollTo: 5 * 50 - 24 });
    expect(edges.below).toEqual({ count: 2, time: DAY0 + 21 * H, scrollTo: 21 * 50 - 600 / 4 });
  });

  test("a short block is measured at its drawn (minimum) length", () => {
    // 07:45–07:50 is drawn 25 minutes long, reaching past 08:00 into view
    expect(findEdges([timed(7.75, 7.75 + 5 / 60)], view).above).toBeNull();
    expect(findEdges([timed(7.25, 7.25 + 5 / 60)], view).above?.count).toBe(1);
  });

  test("blocks within a few px of the edge count as out of view", () => {
    // Ends 2px below the top edge; starts 2px above the bottom edge
    const edges = findEdges([timed(7, 8 + 2 / 50), timed(20 - 2 / 50, 21)], view);
    expect(edges.above?.count).toBe(1);
    expect(edges.below?.count).toBe(1);
  });
});

describe("sameEdges", () => {
  test("ignores the scroll target, which moves with the hour height", () => {
    const a = { above: { count: 1, time: 5, scrollTo: 10 }, below: null };
    const b = { above: { count: 1, time: 5, scrollTo: 99 }, below: null };
    expect(sameEdges(a, b)).toBe(true);
    expect(sameEdges(a, NO_EDGES)).toBe(false);
    expect(sameEdges(a, { ...a, above: { count: 2, time: 5, scrollTo: 10 } })).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import {
  blockGeometry,
  findEdges,
  focusDayIndex,
  isLastSegment,
  NO_EDGES,
  sameEdges,
} from "../../src/web/src/lib/calendarGrid.ts";
import { layoutDay, type PlacedBlock } from "../../src/web/src/lib/layout.ts";

const H = 3_600_000;
const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const DAY1 = new Date(2026, 9, 6).getTime();

/** A block of [startHour, endHour] since midnight on `dayStart`. */
const timed = (start: number, end: number, dayStart = DAY0) => ({
  dayStart,
  start: start * H,
  end: end * H,
});

function session(id: string, spans: [number, number][], active = false): CalendarSession {
  const segments = spans.map(([start, end]) => ({
    start,
    end,
    headline: id,
    summarized: true,
    body: null,
    prs: [],
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
    active,
    segments,
  };
}

/** The only block a single-span session lays out on DAY0. */
function placed(start: number, end: number): PlacedBlock {
  const [block] = layoutDay([session("s", [[DAY0 + start * H, DAY0 + end * H]])], DAY0);
  if (!block) throw new Error("no block laid out");
  return block;
}

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

describe("blockGeometry", () => {
  test("a long block is filled over its full height", () => {
    const geo = blockGeometry(placed(9, 11), 50);
    expect(geo).toEqual({
      top: 9 * 50 + 1,
      height: 100 - 2,
      filledPx: 100 - 2,
      stretched: false,
      short: false,
      visible: 98,
      lines: 3,
    });
  });

  test("a short block is stretched to the minimum, filled only over its real length", () => {
    const geo = blockGeometry(placed(9, 9 + 12 / 60), 48);
    expect(geo.height).toBeCloseTo((25 / 60) * 48 - 2);
    expect(geo.filledPx).toBeCloseTo(0.2 * 48 - 2);
    expect(geo.stretched).toBe(true);
    expect(geo.short).toBe(true);
    expect(geo.lines).toBe(1);
  });

  test("a covered block fits its heading above the block on top", () => {
    const geo = blockGeometry({ ...placed(9, 12), coveredFrom: 9.5 * H }, 50);
    expect(geo.visible).toBe(25);
    expect(geo.lines).toBe(1);
  });
});

describe("focusDayIndex", () => {
  const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 5 + i).getTime());
  const sessions = [session("a", [[DAY1 + 10 * H, DAY1 + 11 * H]])];

  test("the day of the selected block", () => {
    expect(focusDayIndex(sessions, "a", null, week)).toBe(1);
  });

  test("a block started before the period belongs to the first day", () => {
    const early = [session("b", [[DAY0 - 2 * H, DAY0 + H]])];
    expect(focusDayIndex(early, "b", null, week)).toBe(0);
  });

  test("none without a selection, or with few days", () => {
    expect(focusDayIndex(sessions, null, null, week)).toBe(-1);
    expect(focusDayIndex(sessions, "a", null, week.slice(0, 3))).toBe(-1);
  });
});

describe("isLastSegment", () => {
  test("only the session's last block, on the day it ends", () => {
    const s = session("s", [
      [DAY0 + 9 * H, DAY0 + 10 * H],
      [DAY0 + 23 * H, DAY1 + H],
    ]);
    const [first, spanning] = layoutDay([s], DAY0);
    const [next] = layoutDay([s], DAY1);
    expect(first && isLastSegment(first)).toBe(false);
    expect(spanning && isLastSegment(spanning)).toBe(false);
    expect(next && isLastSegment(next)).toBe(true);
  });
});

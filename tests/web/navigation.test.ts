import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { orderedBlocks, selectedSegment, stepBlock } from "../../src/web/src/lib/navigation.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const at = (h: number) => DAY0 + h * 3_600_000;

function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => ({
    start,
    end,
    headline: id,
    summarized: true,
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

const sessions = [
  session("a", [at(9), at(10)], [at(14), at(15)]),
  session("b", [at(11), at(12)]),
  // A block continuing from the previous day is included; one starting after the period is not
  session("c", [at(-2), at(1)], [at(30), at(31)]),
];
const list = orderedBlocks(sessions, DAY0, DAY0 + 24 * 3_600_000);

describe("orderedBlocks", () => {
  test("sorts blocks in the period by start across sessions", () => {
    expect(list.map((b) => `${b.id}@${(b.at - DAY0) / 3_600_000}`)).toEqual([
      "c@-2",
      "a@9",
      "b@11",
      "a@14",
    ]);
  });
});

describe("stepBlock", () => {
  test("steps to adjacent blocks and returns null at the ends", () => {
    expect(stepBlock(list, { id: "a", at: at(9) }, 1)).toEqual({ id: "b", at: at(11) });
    expect(stepBlock(list, { id: "a", at: at(9) }, -1)).toEqual({ id: "c", at: at(-2) });
    expect(stepBlock(list, { id: "a", at: at(14) }, 1)).toBeNull();
  });

  test("with nothing selected, next picks the first and previous the last", () => {
    expect(stepBlock(list, null, 1)).toEqual({ id: "c", at: at(-2) });
    expect(stepBlock(list, null, -1)).toEqual({ id: "a", at: at(14) });
  });

  test("with a block outside the period selected, moves to the nearest by time", () => {
    expect(stepBlock(list, { id: "c", at: at(30) }, -1)).toEqual({ id: "a", at: at(14) });
    expect(stepBlock(list, { id: "x", at: at(10.5) }, 1)).toEqual({ id: "b", at: at(11) });
  });
});

describe("selectedSegment", () => {
  test("returns the session's last block when at is null", () => {
    expect(selectedSegment(sessions, "a", null)?.start).toBe(at(14));
    expect(selectedSegment(sessions, "a", at(9))?.start).toBe(at(9));
    expect(selectedSegment(sessions, "z", null)).toBeNull();
  });
});

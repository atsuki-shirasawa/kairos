import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import {
  burstsOf,
  orderedBlocks,
  runOf,
  selectedSegment,
  stepBlock,
} from "../../src/web/src/lib/navigation.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const at = (h: number) => DAY0 + h * 3_600_000;

function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => ({
    start,
    end,
    headline: id,
    short: null,
    summarized: true,
    turns: [],
    body: null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: {
      commits: 0,
      prs: 0,
      merges: 0,
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
    branch: null,
    scheduledRuns: 0,
    headless: false,
    unit: null,
    continued: false,
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

describe("burstsOf / runOf", () => {
  const headless = (id: string, h: number) => ({
    ...session(id, [at(h), at(h) + 5_000]),
    headless: true,
    unit: null,
  });
  const burst = [headless("r1", 10), headless("r2", 10.01), headless("r3", 10.02)];
  const refs = (ss: CalendarSession[]) => ss.map((s) => ({ id: s.id, at: s.startedAt }));

  test("places a run within its burst", () => {
    expect(runOf(burstsOf(burst), { id: "r2", at: at(10.01) })).toEqual({
      index: 1,
      ref: null,
      runs: refs(burst),
    });
  });

  test("is null for a lone run, prompted work, or no selection", () => {
    const lone = [headless("r1", 10), headless("r2", 12)];
    expect(runOf(burstsOf(lone), { id: "r1", at: at(10) })).toBeNull();
    expect(runOf(burstsOf([...burst, ...sessions]), { id: "b", at: at(11) })).toBeNull();
    expect(runOf(burstsOf(burst), null)).toBeNull();
  });

  test("splits a burst at midnight, as each day column draws its own mark", () => {
    const late = [
      headless("a", 23.98),
      headless("b", 23.99),
      headless("c", 24.0),
      headless("d", 24.01),
    ];
    expect(burstsOf(late)).toEqual([
      { ref: null, runs: refs(late.slice(0, 2)) },
      { ref: null, runs: refs(late.slice(2)) },
    ]);
  });

  test("steps through a unit of work's runs across days, long ones too, and only those", () => {
    const unit = { id: "u1", ref: 31 };
    const iteration = { ...session("u1", [at(9), at(9.4)]), headless: true, unit };
    const pr = { ...headless("u2", 9.5), unit };
    const reply = { ...headless("u3", 33), unit };
    const other = headless("x", 9.51);
    const bursts = burstsOf([iteration, pr, other, reply]);
    expect(runOf(bursts, { id: "u2", at: at(9.5) })).toEqual({
      index: 1,
      ref: 31,
      runs: refs([iteration, pr, reply]),
    });
    // A run outside the unit doesn't join it, though it ran a minute later
    expect(runOf(bursts, { id: "x", at: at(9.51) })).toBeNull();
  });

  test("steps through a unit's runs one each, at a run's first block", () => {
    const unit = { id: "u1", ref: 31 };
    const twoBlocks = {
      ...session("u1", [at(9), at(9.1)], [at(11), at(11.1)]),
      headless: true,
      unit,
    };
    const pr = { ...headless("u2", 12), unit };
    expect(burstsOf([twoBlocks, pr])).toEqual([
      {
        ref: 31,
        runs: [
          { id: "u1", at: at(9) },
          { id: "u2", at: at(12) },
        ],
      },
    ]);
  });
});

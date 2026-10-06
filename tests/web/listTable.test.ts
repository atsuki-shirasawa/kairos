import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { addDays } from "../../src/web/src/lib/dates.ts";
import { blocksOfDay } from "../../src/web/src/lib/layout.ts";
import {
  dayGroups,
  nextSort,
  parseColumns,
  sameColumns,
  sortBlocks,
  toggleColumn,
  visibleSort,
} from "../../src/web/src/lib/listTable.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const DAYS = Array.from({ length: 3 }, (_, i) => addDays(DAY0, i));
const at = (day: number, h: number) => addDays(DAY0, day) + h * 3_600_000;

function session(id: string, ...segments: [number, number][]): CalendarSession {
  return {
    id,
    projectId: 1,
    label: null,
    branch: null,
    scheduledRuns: 0,
    continued: false,
    title: id,
    startedAt: segments[0]?.[0] ?? 0,
    endedAt: segments.at(-1)?.[1] ?? 0,
    promptCount: 1,
    active: false,
    segments: segments.map(([start, end]) => ({
      start,
      end,
      headline: id,
      summarized: true,
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
    })),
  };
}

const ORDER = ["duration", "outcomes", "cost"] as const;

describe("dayGroups", () => {
  const sessions = [session("a", [at(0, 9), at(0, 10)]), session("b", [at(2, 9), at(2, 10)])];

  test("keeps empty past days as days off and drops empty days after today", () => {
    const groups = dayGroups(DAYS, sessions, () => true, at(1, 12));
    expect(groups.map((g) => [g.day, g.blocks.length])).toEqual([
      [DAY0, 1],
      [addDays(DAY0, 1), 0],
      [addDays(DAY0, 2), 1],
    ]);
    const early = dayGroups(DAYS, [sessions[0] as CalendarSession], () => true, at(0, 12));
    expect(early.map((g) => g.day)).toEqual([DAY0]);
  });

  test("leaves out blocks that don't match the filter", () => {
    const groups = dayGroups(DAYS, sessions, (s) => s.id === "b", at(2, 12));
    expect(groups.map((g) => g.blocks.map((b) => b.session.id))).toEqual([[], [], ["b"]]);
  });
});

describe("sortBlocks", () => {
  const blocks = blocksOfDay(
    [session("short", [at(0, 9), at(0, 10)]), session("long", [at(0, 11), at(0, 14)])],
    DAY0,
  );
  const length = (b: (typeof blocks)[number]) => b.end - b.start;

  test("orders by the value, either way", () => {
    expect(sortBlocks(blocks, length, true).map((b) => b.session.id)).toEqual(["long", "short"]);
    expect(sortBlocks(blocks, length, false).map((b) => b.session.id)).toEqual(["short", "long"]);
  });

  test("keeps time order when the column has no value", () => {
    expect(sortBlocks(blocks, undefined, true)).toBe(blocks);
  });
});

describe("sorting", () => {
  test("time always runs oldest first", () => {
    expect(nextSort({ key: "cost", desc: true }, "start")).toEqual({ key: "start", desc: false });
  });

  test("a number column starts largest first and reverses on a second click", () => {
    expect(nextSort({ key: "start", desc: false }, "cost")).toEqual({ key: "cost", desc: true });
    expect(nextSort({ key: "cost", desc: true }, "cost")).toEqual({ key: "cost", desc: false });
  });

  test("falls back when sorting by a hidden column", () => {
    const fallback = { key: "start", desc: false };
    expect(visibleSort({ key: "cost", desc: true }, ["duration"], fallback)).toBe(fallback);
    const shown = { key: "duration", desc: true };
    expect(visibleSort(shown, ["duration"], fallback)).toBe(shown);
  });
});

describe("columns", () => {
  test("reads a saved list in display order, dropping unknown keys", () => {
    expect(parseColumns(["cost", "gone", "duration"], ORDER)).toEqual(["duration", "cost"]);
    expect(parseColumns({ cost: true }, ORDER)).toBeNull();
    expect(parseColumns(null, ORDER)).toBeNull();
  });

  test("toggles a column in display order", () => {
    expect(toggleColumn(ORDER, ["cost"], "duration", true)).toEqual(["duration", "cost"]);
    expect(toggleColumn(ORDER, ["duration", "cost"], "cost", false)).toEqual(["duration"]);
  });

  test("compares choices whatever their order", () => {
    expect(sameColumns(["outcomes", "duration"], ["duration", "outcomes"])).toBe(true);
    expect(sameColumns(["duration"], ["duration", "outcomes"])).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  carryIds,
  drawnActivity,
  fallbackTitle,
  isWork,
  topicWorkBlocks,
  toSegments,
  workBlocks,
} from "../../../src/server/ingest/segments.ts";
import type { ActivityRow } from "../../../src/server/ingest/statements.ts";

const m = 60_000;

/** An activity row at `min` minutes, human unless `scheduled`. */
const row = (min: number, kind: string, text: string | null = null, scheduled = false) =>
  ({
    ts: min * m,
    kind,
    text,
    is_scheduled: scheduled ? 1 : 0,
  }) satisfies ActivityRow;

test("toSegments splits where the gap is longer than the interval", () => {
  expect(toSegments([0, 5 * m, 10 * m, 60 * m, 62 * m], 15 * m)).toEqual([
    [0, 10 * m],
    [60 * m, 62 * m],
  ]);
  expect(toSegments([])).toEqual([]);
});

describe("drawnActivity", () => {
  test("leaves out automatic-run turns when there is human activity", () => {
    const human = row(1, "prompt", "hi");
    expect(drawnActivity([row(0, "scheduled", null, true), human])).toEqual([human]);
  });

  test("keeps everything in a session with only automatic runs", () => {
    const rows = [row(0, "scheduled", null, true), row(1, "assistant", "ok", true)];
    expect(drawnActivity(rows)).toEqual(rows);
  });
});

test.each([
  ["prompt", true],
  ["command", true],
  ["sdk_prompt", true],
  ["scheduled", true],
  ["tool_use", true],
  ["assistant", false],
  ["compact", false],
  ["error", false],
])("isWork for a block with a %s row is %p", (kind, expected) => {
  expect(isWork([row(0, "assistant"), row(1, kind)])).toBe(expected);
});

describe("fallbackTitle", () => {
  test("prefers a typed prompt over a command, taking its first line", () => {
    const inside = [row(0, "command", "/loop 5m"), row(1, "prompt", "  Fix the bug\nmore")];
    expect(fallbackTitle(inside)).toBe("Fix the bug");
  });

  test("falls back to a command, then an SDK input, then the last reply", () => {
    expect(fallbackTitle([row(0, "command", "/compact")])).toBe("/compact");
    expect(fallbackTitle([row(0, "sdk_prompt", "run it")])).toBe("run it");
    expect(fallbackTitle([row(0, "assistant", "first"), row(1, "assistant", "last")])).toBe("last");
    expect(fallbackTitle([row(0, "tool_use")])).toBeNull();
  });

  test("keeps at most 120 characters", () => {
    expect(fallbackTitle([row(0, "prompt", "x".repeat(200))])).toBe("x".repeat(120));
  });
});

test("workBlocks splits activity into blocks, dropping fragments that aren't work", () => {
  const rows = [
    row(0, "prompt", "Start"),
    row(5, "tool_use"),
    row(10, "assistant", "Done"),
    row(60, "compact"),
    row(61, "assistant", "After compaction"),
    row(120, "command", "/review"),
  ];
  expect(workBlocks(rows, 15 * m)).toEqual([
    { start: 0, end: 10 * m, prompts: 1, fallbackTitle: "Start" },
    { start: 120 * m, end: 120 * m, prompts: 1, fallbackTitle: "/review" },
  ]);
});

test("topicWorkBlocks splits a long block on a topic change, then joins a fragment back", () => {
  /** A prompt with no tool input, as `topicActivity` loads it. */
  const ask = (min: number, text: string) => ({
    ...row(min, "prompt", text),
    tool_name: null,
    input: null,
  });
  const rows = [
    ask(0, "Fix #1"),
    ask(16, "and its tests"),
    ask(30, "Then #2"),
    ask(44, "more of #2"),
    ask(58, "#2 done?"),
    ask(70, "#2 one more thing"),
  ];
  expect(topicWorkBlocks(rows, [], 20 * m)).toEqual([
    { start: 0, end: 16 * m, prompts: 2, fallbackTitle: "Fix #1" },
    { start: 30 * m, end: 70 * m, prompts: 4, fallbackTitle: "Then #2" },
  ]);
  // The block ends; a return to #2 after a pause joins it
  expect(topicWorkBlocks([...rows, ask(100, "#2 again")], [], 20 * m)).toHaveLength(2);
});

describe("carryIds", () => {
  const block = (start: number, end: number) => ({ start, end, prompts: 1, fallbackTitle: null });
  const stored = (id: number, start: number, end: number) => ({ id, start, end });

  test("a block whose start or end moved keeps its id", () => {
    expect(
      carryIds([stored(1, 10, 20), stored(2, 40, 50)], [block(12, 22), block(40, 55)]),
    ).toEqual({
      kept: [
        { id: 1, block: block(12, 22) },
        { id: 2, block: block(40, 55) },
      ],
      added: [],
      merged: [],
      dropped: [],
    });
  });

  test("a split keeps the id on the larger part, and the other part is new", () => {
    expect(carryIds([stored(1, 10, 50)], [block(10, 15), block(30, 50)])).toEqual({
      kept: [{ id: 1, block: block(30, 50) }],
      added: [block(10, 15)],
      merged: [],
      dropped: [],
    });
  });

  test("a merge keeps the oldest id and folds the others into it", () => {
    expect(carryIds([stored(7, 40, 50), stored(3, 10, 20)], [block(10, 50)])).toEqual({
      kept: [{ id: 3, block: block(10, 50) }],
      added: [],
      merged: [{ id: 7, into: 3 }],
      dropped: [],
    });
  });

  test("a stored block that only touches a new one shares no work and is dropped", () => {
    expect(carryIds([stored(1, 10, 20), stored(2, 50, 60)], [block(20, 25)])).toEqual({
      kept: [],
      added: [block(20, 25)],
      merged: [],
      dropped: [1, 2],
    });
  });

  test("a block of a single moment still meets the span it touches", () => {
    expect(carryIds([stored(1, 30, 30)], [block(30, 40)])).toEqual({
      kept: [{ id: 1, block: block(30, 40) }],
      added: [],
      merged: [],
      dropped: [],
    });
  });
});

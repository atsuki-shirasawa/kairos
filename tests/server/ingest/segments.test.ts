import { describe, expect, test } from "bun:test";
import {
  drawnActivity,
  fallbackTitle,
  isPrompt,
  isWork,
  toSegments,
  workBlocks,
} from "../../../src/server/ingest/segments.ts";
import type { ActivityRow } from "../../../src/server/ingest/statements.ts";

const m = 60_000;

/** An activity row at `min` minutes, human unless `scheduled`. */
const row = (min: number, kind: string, text: string | null = null, scheduled = false) =>
  ({ ts: min * m, kind, text, is_scheduled: scheduled ? 1 : 0 }) satisfies ActivityRow;

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

test("isPrompt is true for prompts and slash commands only", () => {
  expect(isPrompt(row(0, "prompt"))).toBe(true);
  expect(isPrompt(row(0, "command"))).toBe(true);
  expect(isPrompt(row(0, "sdk_prompt"))).toBe(false);
  expect(isPrompt(row(0, "assistant"))).toBe(false);
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

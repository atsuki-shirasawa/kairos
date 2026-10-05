import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { blocksOfDay } from "../../src/web/src/lib/layout.ts";
import { isSelected, isWorking } from "../../src/web/src/lib/selection.ts";

const DAY0 = new Date(2026, 9, 5).getTime();
const H = 3_600_000;

function session(active: boolean): CalendarSession {
  const segment = (start: number, end: number) => ({
    start,
    end,
    headline: "x",
    summarized: true,
    body: null,
    prs: [],
    commits: [],
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
  });
  return {
    id: "s",
    projectId: 1,
    label: null,
    title: "s",
    startedAt: DAY0 + 9 * H,
    endedAt: DAY0 + 12 * H,
    promptCount: 2,
    active,
    segments: [segment(DAY0 + 9 * H, DAY0 + 10 * H), segment(DAY0 + 11 * H, DAY0 + 12 * H)],
  };
}

describe("isSelected", () => {
  const [first, second] = blocksOfDay([session(false)], DAY0);

  test("matches the section, or every section when no start is given", () => {
    if (!first || !second) throw new Error("expected two blocks");
    expect(isSelected(first, "s", first.segment.start)).toBe(true);
    expect(isSelected(second, "s", first.segment.start)).toBe(false);
    expect(isSelected(second, "s", null)).toBe(true);
    expect(isSelected(first, "other", null)).toBe(false);
  });
});

describe("isWorking", () => {
  test("only the latest section of a running session", () => {
    const [first, second] = blocksOfDay([session(true)], DAY0);
    expect(first && isWorking(first)).toBe(false);
    expect(second && isWorking(second)).toBe(true);
    const [, ended] = blocksOfDay([session(false)], DAY0);
    expect(ended && isWorking(ended)).toBe(false);
  });
});

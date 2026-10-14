import { describe, expect, test } from "bun:test";
import type { Activity, CalendarSegment, CalendarSession, Usage } from "../../src/shared/api.ts";
import type { DayBlock } from "../../src/web/src/lib/layout.ts";
import { dayFigures } from "../../src/web/src/lib/totals.ts";

const H = 3_600_000;

const activity = (a: Partial<Activity> = {}): Activity => ({
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
  ...a,
});

const usage = (costUsd: number): Usage => ({
  tokens: 100,
  input: 100,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd,
  unpriced: false,
  model: null,
});

function block(
  start: number,
  end: number,
  segment: Partial<CalendarSegment>,
  continuesBefore = false,
): DayBlock {
  return {
    session: { id: "s" } as CalendarSession,
    segment: { usage: null, activity: null, ...segment } as CalendarSegment,
    dayStart: 0,
    start,
    end,
    continuesBefore,
    continuesAfter: false,
  };
}

describe("dayFigures", () => {
  test("is empty for a day without blocks", () => {
    expect(dayFigures([])).toEqual({
      shown: 0,
      counted: 0,
      busy: 0,
      usage: null,
      activity: null,
      commits: 0,
      prs: 0,
      trouble: 0,
      troubleDetail: "",
    });
  });

  test("sums the blocks, counting a block continued from yesterday only for its time", () => {
    const f = dayFigures([
      block(0, H, { usage: usage(5), activity: activity({ commits: 3, toolErrors: 2 }) }, true),
      block(H, 2 * H, { usage: usage(1), activity: activity({ commits: 1, prs: 1 }) }),
      block(3 * H, 4 * H, { usage: usage(2), activity: activity({ interrupts: 1 }) }),
    ]);
    expect(f.shown).toBe(3);
    expect(f.counted).toBe(2);
    expect(f.busy).toBe(3 * H);
    expect(f.usage?.costUsd).toBe(3);
    expect(f.commits).toBe(1);
    expect(f.prs).toBe(1);
    expect(f.trouble).toBe(1);
    expect(f.troubleDetail).toBe("Interrupts 1");
  });
});

import { describe, expect, test } from "bun:test";
import type { PlanLimits } from "../../src/shared/api.ts";
import { DAY, HOUR, MINUTE } from "../../src/shared/dates.ts";
import { LIMITS_STALE_MS, planWindows, staleSince } from "../../src/web/src/lib/planLimits.ts";

// Local noon, so a reset a few hours out stays on the same day in any time zone
const NOW = new Date(2026, 9, 19, 12, 0).getTime();

function limits(over: Partial<PlanLimits> = {}): PlanLimits {
  return {
    fiveHour: { usedPercent: 23.5, resetsAt: NOW + 2 * HOUR },
    sevenDay: { usedPercent: 84, resetsAt: NOW + 3 * DAY },
    seenAt: NOW,
    ...over,
  };
}

describe("planWindows", () => {
  test("shows each window as a whole percent, warning when little is left", () => {
    expect(planWindows(limits(), NOW)).toEqual([
      { kind: "fiveHour", usedPercent: 24, resetsAt: NOW + 2 * HOUR, reset: false, warn: false },
      { kind: "sevenDay", usedPercent: 84, resetsAt: NOW + 3 * DAY, reset: false, warn: true },
    ]);
  });

  test("starts a window over once its reset time has passed", () => {
    const [five] = planWindows(limits(), NOW + 2 * HOUR);
    expect(five).toMatchObject({ usedPercent: 0, reset: true, warn: false });
  });

  test("leaves out a window Claude Code didn't report", () => {
    expect(planWindows(limits({ fiveHour: null }), NOW).map((w) => w.kind)).toEqual(["sevenDay"]);
  });

  test("keeps the share within the bar", () => {
    const over = limits({ fiveHour: { usedPercent: 103, resetsAt: NOW + HOUR } });
    expect(planWindows(over, NOW)[0]?.usedPercent).toBe(100);
  });
});

describe("staleSince", () => {
  test("says nothing while the reading is recent", () => {
    expect(staleSince(limits(), NOW + LIMITS_STALE_MS - MINUTE)).toBeNull();
  });

  test("gives when it was read once it is old", () => {
    expect(staleSince(limits(), NOW + LIMITS_STALE_MS)).toBe(NOW);
  });
});

import { describe, expect, test } from "bun:test";
import { comparable, elapsedInPeriod, signed } from "../../src/web/src/lib/periodChange.ts";
import type { PeriodSummary } from "../../src/web/src/lib/summary.ts";

const summary = (busyMs: number, costUsd: number | null): PeriodSummary => ({
  blocks: 1,
  busyMs,
  claudeMs: null,
  prs: [],
  commits: 2,
  usage:
    costUsd === null
      ? null
      : {
          tokens: 100,
          input: 100,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          costUsd,
          unpriced: false,
          model: null,
        },
  days: [],
  projects: [],
});

describe("signed", () => {
  test("prefixes a plus or a typographic minus", () => {
    expect(signed(3, String)).toBe("+3");
    expect(signed(-3, String)).toBe("−3");
  });
});

describe("comparable", () => {
  test("rounds time to the minute and cost to the cent", () => {
    expect(comparable(summary(90_400, 0.1 + 0.2))).toEqual({
      busyMs: 120_000,
      prs: 0,
      commits: 2,
      tokens: 100,
      cents: 30,
    });
  });

  test("counts missing usage as zero", () => {
    const c = comparable(summary(0, null));
    expect([c.tokens, c.cents]).toEqual([0, 0]);
  });
});

describe("elapsedInPeriod", () => {
  test("floors to the minute while the period runs", () => {
    expect(elapsedInPeriod(1000 + 125_000, 1000, 10_000_000)).toBe(120_000);
  });

  test("is null before and after the period", () => {
    expect(elapsedInPeriod(999, 1000, 2000)).toBeNull();
    expect(elapsedInPeriod(2000, 1000, 2000)).toBeNull();
  });
});

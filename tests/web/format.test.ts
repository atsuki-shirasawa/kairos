import { afterEach, describe, expect, test } from "bun:test";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import {
  cacheRate,
  costLabel,
  modelLabel,
  numberLabel,
  sumActivity,
  sumUsage,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "../../src/web/src/lib/format.ts";

describe("tokensLabel", () => {
  test("abbreviates to k, M, and B by magnitude", () => {
    expect([950, 24_800, 893_300, 6_000_000, 1_548_800_000].map(tokensLabel)).toEqual([
      "950",
      "24.8k",
      "893k",
      "6.0M",
      "1.55B",
    ]);
  });
});

describe("costLabel", () => {
  test("rounds amounts under a cent and from $100 up", () => {
    expect([0, 0.004, 0.1105, 54.2, 1234.5].map(costLabel)).toEqual([
      "$0",
      "<$0.01",
      "$0.11",
      "$54.20",
      "$1,235",
    ]);
  });
});

describe("numberLabel", () => {
  test("groups digits", () => {
    expect(numberLabel(1_234_567)).toBe("1,234,567");
  });
});

describe("modelLabel", () => {
  test("shows family and version, drops the date, and passes unknown shapes through", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(modelLabel("gpt-x")).toBe("gpt-x");
  });
});

describe("cacheRate and sumUsage", () => {
  const u = (input: number, cacheRead: number, cacheWrite: number, cost: number) => ({
    tokens: input + cacheRead + cacheWrite,
    input,
    output: 0,
    cacheRead,
    cacheWrite,
    costUsd: cost,
    unpriced: false,
    model: "claude-opus-5-5",
  });

  test("cache rate is the share of all input read from the cache", () => {
    expect(cacheRate(u(2_500, 70_000, 9_000, 0))).toBeCloseTo(0.859, 3);
    expect(cacheRate(u(0, 0, 0, 0))).toBeNull();
  });

  test("totals skip missing entries and carry over the unpriced flag", () => {
    const sum = sumUsage([u(1, 2, 3, 0.5), null, { ...u(1, 0, 0, 0.25), unpriced: true }]);
    expect(sum).toMatchObject({ tokens: 7, costUsd: 0.75, unpriced: true, model: null });
    expect(sumUsage([null])).toBeNull();
  });
});

describe("activity totals and snags", () => {
  const a = {
    commits: 1,
    prs: 0,
    merges: 0,
    filesEdited: 2,
    toolCalls: 5,
    subagents: 0,
    toolErrors: 1,
    interrupts: 1,
    apiErrors: 0,
    compactions: 0,
    claudeMs: null,
    effort: "high",
  };

  afterEach(() => setLocale("en"));

  test("snags sum errors, interrupts, and API errors; the breakdown leaves out zeros", () => {
    expect(troubleCount(a)).toBe(2);
    expect(troubleDetail(a)).toBe("Tool errors 1 · Interrupts 1");
    expect(troubleDetail({ ...a, toolErrors: 0, interrupts: 0 })).toBe("None");
  });

  test("the snag breakdown follows the language", () => {
    setLocale("ja");
    expect(troubleDetail(a)).toBe("ツールのエラー 1・中断 1");
    expect(troubleDetail({ ...a, toolErrors: 0, interrupts: 0 })).toBe("なし");
  });

  test("Claude time adds only recorded entries, and is null when none recorded it", () => {
    expect(sumActivity([a, null, { ...a, claudeMs: 60_000 }])).toMatchObject({
      commits: 2,
      filesEdited: 4,
      claudeMs: 60_000,
      effort: null,
    });
    expect(sumActivity([a])?.claudeMs).toBeNull();
    expect(sumActivity([null])).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import {
  cacheRate,
  costLabel,
  modelLabel,
  sumActivity,
  sumUsage,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "../../src/web/src/lib/format.ts";

describe("tokensLabel", () => {
  test("桁に合わせて k・M・B にまとめる", () => {
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
  test("1 セント未満と 100 ドル以上は丸める", () => {
    expect([0, 0.004, 0.1105, 54.2, 1234.5].map(costLabel)).toEqual([
      "$0",
      "<$0.01",
      "$0.11",
      "$54.20",
      "$1,235",
    ]);
  });
});

describe("modelLabel", () => {
  test("ファミリー名と版にする。日付は落とし、知らない形はそのまま", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(modelLabel("gpt-x")).toBe("gpt-x");
  });
});

describe("cacheRate・sumUsage", () => {
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

  test("キャッシュ率は入力全体のうち読み込んだ割合", () => {
    expect(cacheRate(u(2_500, 70_000, 9_000, 0))).toBeCloseTo(0.859, 3);
    expect(cacheRate(u(0, 0, 0, 0))).toBeNull();
  });

  test("合計は記録のないものを飛ばし、料金不明の印を引き継ぐ", () => {
    const sum = sumUsage([u(1, 2, 3, 0.5), null, { ...u(1, 0, 0, 0.25), unpriced: true }]);
    expect(sum).toMatchObject({ tokens: 7, costUsd: 0.75, unpriced: true, model: null });
    expect(sumUsage([null])).toBeNull();
  });
});

describe("活動の合計とつまずき", () => {
  const a = {
    commits: 1,
    prs: 0,
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

  test("つまずきはエラー・中断・API エラーの合計で、内訳は 0 のものを省く", () => {
    expect(troubleCount(a)).toBe(2);
    expect(troubleDetail(a)).toBe("ツールのエラー 1・中断 1");
    expect(troubleDetail({ ...a, toolErrors: 0, interrupts: 0 })).toBe("なし");
  });

  test("Claude の稼働は記録のあるものだけ足し、どれにもなければ null", () => {
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

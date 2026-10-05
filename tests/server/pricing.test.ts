import { describe, expect, test } from "bun:test";
import { costOf, priceOf } from "../../src/server/pricing.ts";

const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

describe("priceOf", () => {
  test("日付の付いた ID も、いちばん長く一致する名前の料金にする", () => {
    expect(priceOf("claude-haiku-4-5-20251001")?.input).toBe(1);
    expect(priceOf("claude-opus-5-5")?.input).toBe(4);
    expect(priceOf("claude-opus-5")?.input).toBe(5);
  });

  test("知らないモデルは null", () => {
    expect(priceOf("claude-unknown-9")).toBeNull();
    expect(priceOf("<synthetic>")).toBeNull();
  });
});

describe("costOf", () => {
  test("キャッシュの書き込みは 5 分が入力の 1.25 倍、1 時間が 2 倍", () => {
    const m = 1_000_000;
    expect(costOf("claude-sonnet-5-5", { ...tokens, cacheWrite5m: m })).toBeCloseTo(2.5);
    expect(costOf("claude-sonnet-5-5", { ...tokens, cacheWrite1h: m })).toBeCloseTo(4);
  });

  test("キャッシュの読み込みはモデルごとの料金", () => {
    const m = 1_000_000;
    expect(costOf("claude-fable-5-1", { ...tokens, cacheRead: m })).toBeCloseTo(0.25);
    expect(costOf("claude-fable-5", { ...tokens, cacheRead: m })).toBeCloseTo(1);
    expect(costOf("claude-opus-5-5", { ...tokens, cacheRead: m })).toBeCloseTo(0.2);
  });

  test("fast モードは対応するモデルだけ割増にする", () => {
    const m = 1_000_000;
    expect(costOf("claude-opus-5-5", { ...tokens, output: m }, "fast")).toBeCloseTo(40);
    expect(costOf("claude-sonnet-5-5", { ...tokens, output: m }, "fast")).toBeCloseTo(10);
  });

  test("知らないモデルは null", () => {
    expect(costOf("claude-unknown-9", { ...tokens, input: 1 })).toBeNull();
  });
});

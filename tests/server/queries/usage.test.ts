import { describe, expect, test } from "bun:test";
import { toUsage, type UsageRow, usageSums } from "../../../src/server/queries/usage.ts";

const row = (over: Partial<UsageRow>): UsageRow => ({
  model: "claude-opus-4-8",
  speed: null,
  input: 0,
  output: 0,
  cache_read: 0,
  cache_write_5m: 0,
  cache_write_1h: 0,
  ...over,
});

describe("usageSums", () => {
  test("sums every token column under its own name", () => {
    expect(usageSums()).toBe(
      "SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read, " +
        "SUM(cache_write_5m) AS cache_write_5m, SUM(cache_write_1h) AS cache_write_1h",
    );
  });

  test("qualifies the columns with a table alias", () => {
    expect(usageSums("u")).toStartWith("SUM(u.input) AS input, SUM(u.output) AS output");
  });
});

describe("toUsage", () => {
  test("no rows, or rows without tokens, are no usage", () => {
    expect(toUsage([])).toBeNull();
    expect(toUsage([row({})])).toBeNull();
  });

  test("adds up tokens across models and names the one with the most output", () => {
    const u = toUsage([
      row({ input: 1_000_000, output: 10, cache_write_5m: 2, cache_write_1h: 3 }),
      row({ model: "claude-sonnet-5-5", output: 1_000_000, cache_read: 4 }),
    ]);
    expect(u).toMatchObject({
      tokens: 2_000_019,
      input: 1_000_000,
      output: 1_000_010,
      cacheRead: 4,
      cacheWrite: 5,
      unpriced: false,
      model: "claude-sonnet-5-5",
    });
    expect(u?.costUsd).toBeGreaterThan(15);
  });

  test("a model with no price marks the usage unpriced and adds no cost", () => {
    const u = toUsage([row({ model: "no-such-model", output: 100 })]);
    expect(u).toMatchObject({ unpriced: true, costUsd: 0, tokens: 100 });
  });
});

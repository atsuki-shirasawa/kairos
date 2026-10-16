import { describe, expect, test } from "bun:test";
import { openDb } from "../../../src/server/db/index.ts";
import {
  blocksTokens,
  sessionUsage,
  toUsage,
  type UsageRow,
  usageSums,
} from "../../../src/server/queries/usage.ts";

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

describe("blocksTokens", () => {
  /** A DB with one session `s`, blocks [100, 200] and [1000, 2000], and the given usage rows. */
  function withUsage(
    rows: { ts: number; model?: string; effort?: string; output: number; copy?: number }[],
  ) {
    const db = openDb(":memory:");
    db.run(
      "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
    );
    db.run("INSERT INTO sessions (id) VALUES ('s')");
    db.run(
      "INSERT INTO segments (session_id, start, end) VALUES ('s', 100, 200), ('s', 1000, 2000)",
    );
    for (const [i, r] of rows.entries()) {
      db.query(
        `INSERT INTO usage (session_id, message_id, file_id, ts, model, effort, input, output, cache_read,
                            cache_write_5m, cache_write_1h, is_copy)
         VALUES ('s', ?, 1, ?, ?, ?, 1, ?, 0, 0, 0, ?)`,
      ).run(`u${i}`, r.ts, r.model ?? "claude-opus-4-8", r.effort ?? null, r.output, r.copy ?? 0);
    }
    return db;
  }
  const ALL = { sql: "SELECT session_id, start, end FROM segments", params: [] };

  test("totals each block apart, leaving out copies and rows outside every block", () => {
    const db = withUsage([
      { ts: 150, output: 10 },
      { ts: 1500, output: 20 },
      { ts: 1600, output: 30, copy: 1 },
      { ts: 500, output: 40 },
    ]);
    const { usage } = blocksTokens(db, ALL);
    expect(usage("s", 100)?.output).toBe(10);
    expect(usage("s", 1000)?.output).toBe(20);
    expect(sessionUsage(db, "s")?.output).toBe(70);
  });

  test("names the effort behind most of each block's output, across models", () => {
    const db = withUsage([
      { ts: 1100, effort: "high", output: 30 },
      { ts: 1200, effort: "medium", output: 20 },
      { ts: 1300, effort: "medium", output: 20, model: "claude-sonnet-5-5" },
      { ts: 150, output: 5 },
    ]);
    const { effort, usage } = blocksTokens(db, ALL);
    expect(effort("s", 1000)).toBe("medium");
    expect(effort("s", 100)).toBeNull();
    expect(usage("s", 1000)?.output).toBe(70);
  });

  test("splitting by effort leaves the cost as computed from one row per model", () => {
    const db = withUsage([
      { ts: 1100, effort: "high", output: 333_333 },
      { ts: 1200, effort: "low", output: 333_333 },
    ]);
    expect(blocksTokens(db, ALL).usage("s", 1000)?.costUsd).toBe(
      toUsage([row({ input: 2, output: 666_666 })])?.costUsd,
    );
  });
});

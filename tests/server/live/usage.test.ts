import { describe, expect, test } from "bun:test";
import {
  type BucketTokens,
  bucketize,
  contextWindow,
  liveTokens,
  perHour,
  tokenBucketCount,
} from "../../../src/server/live/usage.ts";
import type { LiveTokens } from "../../../src/shared/api.ts";
import { LIVE_RATE_WINDOW_MS, TOKEN_BUCKET_MS } from "../../../src/shared/constants.ts";
import { HOUR, MINUTE } from "../../../src/shared/dates.ts";
import { min, setup } from "../ingest/helpers.ts";
import { appendResponse, VISIBLE } from "./helpers.ts";

describe("tokenBucketCount", () => {
  test.each<[string, number, number]>([
    ["right at midnight", 0, 1],
    ["mid-bucket", 10 * HOUR + 7 * MINUTE + 13_000, 122],
    // The bucket that would start at now holds nothing yet
    ["on a bucket edge", 10 * HOUR, 120],
    ["one ms before an edge", 10 * HOUR - 1, 120],
    ["one ms after an edge", 10 * HOUR + 1, 121],
  ])("%s: buckets since midnight, the last one in progress", (_name, sinceMidnight, count) => {
    const midnight = 1_700_000_000_000 - (1_700_000_000_000 % TOKEN_BUCKET_MS);
    expect(tokenBucketCount(midnight, midnight + sinceMidnight)).toBe(count);
  });
});

describe("bucketize", () => {
  /** A token row with the given bucket, project and count. */
  const row = (bucket: number, projectId: number | null, tokens: number): BucketTokens => ({
    bucket,
    projectId,
    tokens,
  });

  test("returns one empty bucket per slot when nothing was used", () => {
    expect(bucketize([], 3)).toEqual([[], [], []]);
  });

  test("orders a bucket's projects largest first, keeping sessions without a project", () => {
    expect(bucketize([row(0, 1, 1), row(0, null, 3), row(0, 2, 2)], 1)).toEqual([
      [
        { projectId: null, tokens: 3 },
        { projectId: 2, tokens: 2 },
        { projectId: 1, tokens: 1 },
      ],
    ]);
  });

  test("leaves out projects with no tokens", () => {
    expect(bucketize([row(0, 1, 0)], 1)).toEqual([[]]);
  });

  test("clamps a row past the last bucket into it, adding it to the same project there", () => {
    expect(bucketize([row(5, 1, 1), row(1, 1, 2)], 2)).toEqual([[], [{ projectId: 1, tokens: 3 }]]);
  });
});

describe("perHour", () => {
  test.each<[number, number, number]>([
    [1, LIVE_RATE_WINDOW_MS, (1 * HOUR) / LIVE_RATE_WINDOW_MS],
    [2, HOUR, 2],
    [2, 30 * MINUTE, 4],
    [0, LIVE_RATE_WINDOW_MS, 0],
  ])("%p over %p ms is %p an hour", (amount, windowMs, expected) => {
    expect(perHour(amount, windowMs)).toBeCloseTo(expected, 10);
  });
});

describe("contextWindow", () => {
  test("a model past 200k runs with a 1M window, whatever its default", () => {
    expect(contextWindow("claude-haiku-4-5-20251001", 42_000)).toBe(200_000);
    expect(contextWindow("claude-haiku-4-5-20251001", 210_000)).toBe(1_000_000);
    expect(contextWindow("claude-opus-5-5", 10)).toBe(1_000_000);
    expect(contextWindow("claude-fable-5-1", 10)).toBe(1_000_000);
    expect(contextWindow("claude-opus-4-8", 10)).toBe(200_000);
  });
});

describe("liveTokens", () => {
  test("adds up today and its tokens over time by project, leaving out hidden projects", () => {
    const s = setup();
    s.ingester.scan();
    const now = min(1705);
    // Other fixture sessions run around then too; the appended response is what changes
    const before = liveTokens(s.db, VISIBLE, now);
    appendResponse(s.projectsDir, 1, { input_tokens: 1_000_000 });
    s.ingester.scan();
    const tokens = liveTokens(s.db, VISIBLE, now);
    // From local midnight, the last bucket in progress up to now
    expect(tokens.from).toBe(new Date(now).setHours(0, 0, 0, 0));
    expect(tokens.to).toBe(now);
    // Enough buckets to reach now, and no empty one past it
    expect(tokens.buckets.length * TOKEN_BUCKET_MS).toBeGreaterThanOrEqual(now - tokens.from);
    expect((tokens.buckets.length - 1) * TOKEN_BUCKET_MS).toBeLessThan(now - tokens.from);
    // 1M input plus 100 output tokens, in the bucket that holds min(1701)
    const i = Math.floor((min(1701) - tokens.from) / TOKEN_BUCKET_MS);
    const total = (b: LiveTokens) => (b.buckets[i] ?? []).reduce((n, p) => n + p.tokens, 0);
    expect(total(tokens) - total(before)).toBe(1_000_100);
    expect(tokens.perHour - before.perHour).toBe(1_000_100 * 4);
    expect(tokens.today - before.today).toBe(1_000_100);
    const bucket = tokens.buckets[i];
    const projectId = bucket?.[0]?.projectId ?? -1;
    s.db.run("UPDATE projects SET hidden = 1 WHERE id = ?", [projectId]);
    expect(liveTokens(s.db, VISIBLE, now).buckets[i]?.some((p) => p.projectId === projectId)).toBe(
      false,
    );
  });
});

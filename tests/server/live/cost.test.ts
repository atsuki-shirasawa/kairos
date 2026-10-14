import { describe, expect, test } from "bun:test";
import {
  type BucketSpend,
  bucketize,
  type LatestResponse,
  ratePerHour,
  requestCosts,
  spendWindowStart,
} from "../../../src/server/live/cost.ts";
import {
  LIVE_RATE_WINDOW_MS,
  SPEND_BUCKET_MS,
  SPEND_BUCKETS,
} from "../../../src/shared/constants.ts";
import { HOUR, MINUTE } from "../../../src/shared/dates.ts";

describe("spendWindowStart", () => {
  test.each<[string, number, number]>([
    ["mid-bucket", 10 * HOUR + 7 * MINUTE + 13_000, 10 * HOUR + 5 * MINUTE],
    ["on a bucket edge", 10 * HOUR, 10 * HOUR],
    ["one ms before an edge", 10 * HOUR - 1, 10 * HOUR - SPEND_BUCKET_MS],
  ])("%s: the last bucket starts on the whole bucket at or before now", (_name, now, last) => {
    expect(spendWindowStart(now)).toBe(last - (SPEND_BUCKETS - 1) * SPEND_BUCKET_MS);
  });

  test("spans the band, with now inside the last bucket", () => {
    const now = 1_700_000_123_456;
    const from = spendWindowStart(now);
    expect(from % SPEND_BUCKET_MS).toBe(0);
    expect(now - from).toBeGreaterThanOrEqual((SPEND_BUCKETS - 1) * SPEND_BUCKET_MS);
    expect(now - from).toBeLessThan(SPEND_BUCKETS * SPEND_BUCKET_MS);
  });
});

describe("bucketize", () => {
  /** A spend row with the given bucket, project and amount. */
  const row = (bucket: number, projectId: number | null, usd: number): BucketSpend => ({
    bucket,
    projectId,
    usd,
    unpriced: false,
  });

  test("returns one empty bucket per slot when nothing was spent", () => {
    expect(bucketize([], 3)).toEqual([[], [], []]);
  });

  test("adds up rows of the same project and bucket (other models or speeds)", () => {
    expect(bucketize([row(1, 7, 0.5), row(1, 7, 0.25)], 2)).toEqual([
      [],
      [{ projectId: 7, usd: 0.75 }],
    ]);
  });

  test("orders a bucket's projects largest first, keeping sessions without a project", () => {
    expect(bucketize([row(0, 1, 1), row(0, null, 3), row(0, 2, 2)], 1)).toEqual([
      [
        { projectId: null, usd: 3 },
        { projectId: 2, usd: 2 },
        { projectId: 1, usd: 1 },
      ],
    ]);
  });

  test("leaves out projects with no priced spend", () => {
    expect(bucketize([row(0, 1, 0), { ...row(0, 2, 0), unpriced: true }], 1)).toEqual([[]]);
  });

  test("clamps a row past the last bucket into it", () => {
    expect(bucketize([row(5, 1, 1), row(1, 1, 2)], 2)).toEqual([[], [{ projectId: 1, usd: 3 }]]);
  });
});

describe("ratePerHour", () => {
  test.each<[number, number, number]>([
    [1, LIVE_RATE_WINDOW_MS, (1 * HOUR) / LIVE_RATE_WINDOW_MS],
    [2, HOUR, 2],
    [2, 30 * MINUTE, 4],
    [0, LIVE_RATE_WINDOW_MS, 0],
  ])("$%p over %p ms is $%p an hour", (usd, windowMs, expected) => {
    expect(ratePerHour(usd, windowMs)).toBeCloseTo(expected, 10);
  });
});

describe("requestCosts", () => {
  // claude-opus-5-5: $4/M input, $0.2/M cache reads; cache writes cost 1.25x (5 min) or 2x (1 h)
  const latest: LatestResponse = {
    model: "claude-opus-5-5",
    speed: null,
    ts: 0,
    context: 1_000_000,
  };

  test("prices a warm cache as reads and a cold one as writes at the TTL's price", () => {
    expect(requestCosts(latest, HOUR)).toEqual({ warm: 0.2, cold: 8 });
    expect(requestCosts(latest, 5 * MINUTE)).toEqual({ warm: 0.2, cold: 5 });
  });

  test("applies the fast-mode multiplier", () => {
    expect(requestCosts({ ...latest, speed: "fast" }, HOUR)).toEqual({ warm: 0.4, cold: 16 });
  });

  test("is null for a model without a price", () => {
    expect(requestCosts({ ...latest, model: "x-1" }, HOUR)).toBeNull();
  });
});

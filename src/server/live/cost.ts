// What running sessions cost: each one's model, context window, prompt cache and next request, and
// the spend across visible sessions for the live page's band. Amounts use the API price list.
import type { Database } from "bun:sqlite";
import type { LiveCost, LiveSpend, LiveUsage } from "../../shared/api.ts";
import { LIVE_RATE_WINDOW_MS, SPEND_BUCKET_MS } from "../../shared/constants.ts";
import { HOUR, MINUTE, startOfDay } from "../../shared/dates.ts";
import { costOf, priceOf } from "../pricing.ts";
import { sessionUsage, toUsage, type UsageRow, usageSums } from "../queries/usage.ts";
import { type SessionVisibility, visibleSessionSql } from "../visibility.ts";

const SMALL_WINDOW = 200_000;
const LARGE_WINDOW = 1_000_000;
const CACHE_TTL_LONG = HOUR;
const CACHE_TTL_SHORT = 5 * MINUTE;

/** The latest main-thread response: what the next request starts from. */
export interface LatestResponse {
  model: string;
  speed: string | null;
  ts: number;
  /** Its context size: input plus cache reads and writes. */
  context: number;
}

/** The session's latest main-thread response, or null before its first. */
export function latestResponse(db: Database, sessionId: string): LatestResponse | null {
  return db
    .query<LatestResponse, [string]>(
      `SELECT model, speed, COALESCE(ts, 0) AS ts,
              input + cache_read + cache_write_5m + cache_write_1h AS context
       FROM usage WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(sessionId);
}

/**
 * The session's model, window, cache and costs as of `now`, from its latest response and the
 * current work block (which starts at `section`).
 */
export function liveUsage(
  db: Database,
  sessionId: string,
  latest: LatestResponse,
  section: number | null,
  now: number,
): LiveUsage {
  const ttl = cacheTtl(db, sessionId);
  return {
    model: latest.model,
    fast: latest.speed === "fast",
    contextWindow: contextWindow(latest.model, largestContext(db, sessionId)),
    cacheExpiresAt: ttl === null ? null : latest.ts + ttl,
    cacheTtlMs: ttl,
    cost: liveCost(db, sessionId, latest, ttl ?? CACHE_TTL_LONG, section, now),
  };
}

/**
 * The window a model runs with. Logs don't record it (a 1M session's model ID carries no `[1m]`),
 * so the price list's `largeWindow` or any response past 200k says 1M.
 */
export function contextWindow(model: string, largest: number): number {
  return largest > SMALL_WINDOW || priceOf(model)?.largeWindow ? LARGE_WINDOW : SMALL_WINDOW;
}

/** Largest main-thread context the session has reached. */
function largestContext(db: Database, sessionId: string): number {
  return (
    db
      .query<{ n: number | null }, [string]>(
        `SELECT MAX(input + cache_read + cache_write_5m + cache_write_1h) AS n FROM usage
         WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0`,
      )
      .get(sessionId)?.n ?? 0
  );
}

/**
 * The TTL of the main thread's cache, from its latest cache write: Claude Code writes either all
 * 1-hour or all 5-minute entries. null when it never wrote any.
 */
function cacheTtl(db: Database, sessionId: string): number | null {
  const row = db
    .query<{ long: number }, [string]>(
      `SELECT cache_write_1h > 0 AS long FROM usage
       WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0
         AND (cache_write_5m > 0 OR cache_write_1h > 0)
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(sessionId);
  if (!row) return null;
  return row.long ? CACHE_TTL_LONG : CACHE_TTL_SHORT;
}

/** The session's costs, or null when its model has no price. */
function liveCost(
  db: Database,
  sessionId: string,
  latest: LatestResponse,
  ttl: number,
  section: number | null,
  now: number,
): LiveCost | null {
  const next = requestCosts(latest, ttl);
  if (!next) return null;
  const recent = sessionSpend(db, sessionId, now - LIVE_RATE_WINDOW_MS, now);
  return {
    blockUsd: section === null ? 0 : sessionSpend(db, sessionId, section, now),
    perHourUsd: ratePerHour(recent, LIVE_RATE_WINDOW_MS),
    warmRequestUsd: next.warm,
    coldRequestUsd: next.cold,
  };
}

/** What the next request costs, depending on whether the prompt cache is still warm. */
export interface RequestCosts {
  /** The cache is warm: the whole context is a cache read. */
  warm: number;
  /** The cache expired: the whole context is written to the cache again, at `ttl`'s price. */
  cold: number;
}

/**
 * What the next request after `latest` costs with a warm and with a cold cache (`ttl` picks the
 * 5-minute or 1-hour write price), or null when the model has no price.
 */
export function requestCosts(latest: LatestResponse, ttl: number): RequestCosts | null {
  const none = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  const warm = costOf(latest.model, { ...none, cacheRead: latest.context }, latest.speed);
  const cold = costOf(
    latest.model,
    ttl === CACHE_TTL_LONG
      ? { ...none, cacheWrite1h: latest.context }
      : { ...none, cacheWrite5m: latest.context },
    latest.speed,
  );
  if (warm === null || cold === null) return null;
  return { warm, cold };
}

/** Spend over a window of `windowMs`, as USD per hour. */
export function ratePerHour(usd: number, windowMs: number): number {
  return (usd * HOUR) / windowMs;
}

/** The session's priced spend within a time range. */
function sessionSpend(db: Database, sessionId: string, from: number, to: number): number {
  return sessionUsage(db, sessionId, from, to)?.costUsd ?? 0;
}

/** Usage totals within one bucket of time, for one project, model and speed. */
interface SpendRow extends UsageRow {
  bucket: number;
  project_id: number | null;
}

/** A bucket's priced spend for one project. */
export interface BucketSpend {
  /** Index of the bucket, counted from the start of the range. */
  bucket: number;
  /** The project, or null for sessions without one. */
  projectId: number | null;
  /** Priced spend. */
  usd: number;
  /** Some of the usage was by a model with no price and is left out of `usd`. */
  unpriced: boolean;
}

/**
 * Spend of visible sessions (the calendar's visibility, minus hidden projects) from `from` to
 * `to`, split into buckets of `bucketMs` and by project.
 */
function visibleSpend(
  db: Database,
  visibility: SessionVisibility,
  from: number,
  to: number,
  bucketMs: number,
): BucketSpend[] {
  const visible = visibleSessionSql(visibility);
  const rows = db
    .query<SpendRow, [number, number, number]>(
      `SELECT (u.ts - ?1) / ?2 AS bucket, s.project_id, u.model, u.speed, ${usageSums("u")}
       FROM usage u JOIN sessions s ON s.id = u.session_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE u.is_copy = 0 AND u.ts BETWEEN ?1 AND ?3 AND COALESCE(p.hidden, 0) = 0 AND ${visible}
       GROUP BY bucket, s.project_id, u.model, u.speed`,
    )
    .all(from, bucketMs, to);
  return rows.map((r) => {
    const u = toUsage([r]);
    return {
      bucket: r.bucket,
      projectId: r.project_id,
      usd: u?.costUsd ?? 0,
      unpriced: !!u?.unpriced,
    };
  });
}

/** Today's spend, the current rate, and today's spend over time by project, as of `now`. */
export function liveSpend(db: Database, visibility: SessionVisibility, now: number): LiveSpend {
  const midnight = startOfDay(now);
  // One scan of the day gives the buckets and the day's total alike
  const today = visibleSpend(db, visibility, midnight, now, SPEND_BUCKET_MS);
  const recent = visibleSpend(
    db,
    visibility,
    now - LIVE_RATE_WINDOW_MS,
    now,
    LIVE_RATE_WINDOW_MS + 1,
  );
  return {
    todayUsd: sum(today),
    perHourUsd: ratePerHour(sum(recent), LIVE_RATE_WINDOW_MS),
    from: midnight,
    to: now,
    buckets: bucketize(today, spendBucketCount(midnight, now)),
    unpriced: today.some((b) => b.unpriced),
  };
}

/**
 * Buckets from `from` (local midnight) up to `now`, the last one in progress, and at least one.
 * Right on an edge the bucket that would start at `now` has nothing yet and is left out; a
 * response stamped exactly `now` goes in the last bucket (`bucketize` clamps it).
 */
export function spendBucketCount(from: number, now: number): number {
  return Math.max(1, Math.ceil((now - from) / SPEND_BUCKET_MS));
}

/**
 * Folds spend rows into `count` buckets of spend by project: projects with a positive total only,
 * largest first.
 */
export function bucketize(spends: readonly BucketSpend[], count: number): LiveSpend["buckets"] {
  const buckets: Map<number | null, number>[] = Array.from({ length: count }, () => new Map());
  for (const b of spends) {
    // Every response falls within the last bucket at the latest; the clamp is a guard
    const bucket = buckets[Math.min(b.bucket, count - 1)];
    bucket?.set(b.projectId, (bucket.get(b.projectId) ?? 0) + b.usd);
  }
  return buckets.map((m) =>
    [...m]
      .filter(([, usd]) => usd > 0)
      .map(([projectId, usd]) => ({ projectId, usd }))
      .sort((a, b) => b.usd - a.usd),
  );
}

/** Total of priced spend. */
function sum(list: BucketSpend[]): number {
  return list.reduce((n, b) => n + b.usd, 0);
}

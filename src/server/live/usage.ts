// What running sessions use: each one's model, context window, prompt cache and tokens, and the
// tokens across visible sessions for the live page's band.
import type { Database } from "bun:sqlite";
import type { LiveTokens, LiveUsage } from "../../shared/api.ts";
import { LIVE_RATE_WINDOW_MS, TOKEN_BUCKET_MS } from "../../shared/constants.ts";
import { HOUR, MINUTE, startOfDay } from "../../shared/dates.ts";
import { priceOf } from "../pricing.ts";
import { contextSql, tokensSql } from "../queries/usage.ts";
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
              ${contextSql()} AS context
       FROM usage WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(sessionId);
}

/**
 * The session's model, window, cache and tokens as of `now`, from its latest response and the
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
    blockTokens: section === null ? 0 : sessionTokens(db, sessionId, section, now),
    perHourTokens: perHour(
      sessionTokens(db, sessionId, now - LIVE_RATE_WINDOW_MS, now),
      LIVE_RATE_WINDOW_MS,
    ),
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
        `SELECT MAX(${contextSql()}) AS n FROM usage
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

/** An amount over a window of `windowMs`, as an amount per hour. */
export function perHour(amount: number, windowMs: number): number {
  return (amount * HOUR) / windowMs;
}

/** The session's tokens within a time range, subagents included. */
function sessionTokens(db: Database, sessionId: string, from: number, to: number): number {
  return (
    db
      .query<{ n: number | null }, [string, number, number]>(
        `SELECT SUM(${tokensSql()}) AS n FROM usage
         WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, from, to)?.n ?? 0
  );
}

/** A bucket's tokens for one project. */
export interface BucketTokens {
  /** Index of the bucket, counted from the start of the range. */
  bucket: number;
  /** The project, or null for sessions without one. */
  projectId: number | null;
  tokens: number;
}

/**
 * The usage rows of visible sessions (the calendar's visibility, minus hidden projects) from
 * `$from` to `$to`, as a FROM and WHERE clause aliasing usage `u` and sessions `s`.
 */
function visibleUsageSql(visibility: SessionVisibility): string {
  return `FROM usage u JOIN sessions s ON s.id = u.session_id
       LEFT JOIN projects p ON p.id = s.project_id
       WHERE u.is_copy = 0 AND u.ts BETWEEN $from AND $to AND COALESCE(p.hidden, 0) = 0
         AND ${visibleSessionSql(visibility)}`;
}

/** Tokens of visible sessions from `from` to `to`, split into buckets of `bucketMs` and by project. */
function visibleTokens(
  db: Database,
  visibility: SessionVisibility,
  from: number,
  to: number,
  bucketMs: number,
): BucketTokens[] {
  return db
    .query<BucketTokens, { from: number; to: number; bucket: number }>(
      `SELECT (u.ts - $from) / $bucket AS bucket, s.project_id AS projectId,
              SUM(${tokensSql("u")}) AS tokens
       ${visibleUsageSql(visibility)}
       GROUP BY bucket, s.project_id`,
    )
    .all({ from, to, bucket: bucketMs });
}

/** Tokens of visible sessions from `from` to `to`, all together. */
function visibleTokenTotal(
  db: Database,
  visibility: SessionVisibility,
  from: number,
  to: number,
): number {
  return (
    db
      .query<{ n: number | null }, { from: number; to: number }>(
        `SELECT SUM(${tokensSql("u")}) AS n ${visibleUsageSql(visibility)}`,
      )
      .get({ from, to })?.n ?? 0
  );
}

/** Today's tokens, the current rate, and today's tokens over time by project, as of `now`. */
export function liveTokens(db: Database, visibility: SessionVisibility, now: number): LiveTokens {
  const midnight = startOfDay(now);
  // One scan of the day gives the buckets and the day's total alike
  const today = visibleTokens(db, visibility, midnight, now, TOKEN_BUCKET_MS);
  const recent = visibleTokenTotal(db, visibility, now - LIVE_RATE_WINDOW_MS, now);
  return {
    today: sum(today),
    perHour: perHour(recent, LIVE_RATE_WINDOW_MS),
    from: midnight,
    to: now,
    buckets: bucketize(today, tokenBucketCount(midnight, now)),
  };
}

/**
 * Buckets from `from` (local midnight) up to `now`, the last one in progress, and at least one.
 * Right on an edge the bucket that would start at `now` has nothing yet and is left out; a
 * response stamped exactly `now` goes in the last bucket (`bucketize` clamps it).
 */
export function tokenBucketCount(from: number, now: number): number {
  return Math.max(1, Math.ceil((now - from) / TOKEN_BUCKET_MS));
}

/**
 * Folds token rows into `count` buckets of tokens by project: projects with a positive total only,
 * largest first. The query gives one row per bucket and project, so rows only merge when the clamp
 * folds a late one into the last bucket.
 */
export function bucketize(rows: readonly BucketTokens[], count: number): LiveTokens["buckets"] {
  const buckets: Map<number | null, number>[] = Array.from({ length: count }, () => new Map());
  for (const b of rows) {
    // Every response falls within the last bucket at the latest; the clamp is a guard
    const bucket = buckets[Math.min(b.bucket, count - 1)];
    bucket?.set(b.projectId, (bucket.get(b.projectId) ?? 0) + b.tokens);
  }
  return buckets.map((m) =>
    [...m]
      .filter(([, tokens]) => tokens > 0)
      .map(([projectId, tokens]) => ({ projectId, tokens }))
      .sort((a, b) => b.tokens - a.tokens),
  );
}

/** Total tokens of the rows. */
function sum(list: BucketTokens[]): number {
  return list.reduce((n, b) => n + b.tokens, 0);
}

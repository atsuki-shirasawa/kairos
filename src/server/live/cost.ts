// What running sessions cost: each one's model, context window, prompt cache and next request, and
// the spend across visible sessions for the live page's band. Amounts use the API price list.
import type { Database } from "bun:sqlite";
import type { LiveCost, LiveSpend, LiveUsage } from "../../shared/api.ts";
import { LIVE_RATE_WINDOW_MS, SPEND_BUCKET_MS, SPEND_BUCKETS } from "../../shared/constants.ts";
import { HOUR, MINUTE } from "../../shared/dates.ts";
import { costOf, priceOf } from "../pricing.ts";
import { sessionUsage, toUsage, type UsageRow } from "../queries.ts";
import { visibleSessionSql } from "../visibility.ts";
import type { LiveVisibility } from "./sessions.ts";

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
  const recent = sessionSpend(db, sessionId, now - LIVE_RATE_WINDOW_MS, now);
  return {
    blockUsd: section === null ? 0 : sessionSpend(db, sessionId, section, now),
    perHourUsd: (recent * HOUR) / LIVE_RATE_WINDOW_MS,
    warmRequestUsd: warm,
    coldRequestUsd: cold,
  };
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
interface BucketSpend {
  bucket: number;
  projectId: number | null;
  usd: number;
  unpriced: boolean;
}

/**
 * Spend of visible sessions (the calendar's visibility, minus hidden projects) from `from` to
 * `to`, split into buckets of `bucketMs` and by project.
 */
function visibleSpend(
  db: Database,
  visibility: LiveVisibility,
  from: number,
  to: number,
  bucketMs: number,
): BucketSpend[] {
  const visible = visibleSessionSql({
    headless: visibility.showHeadless,
    hiddenCwds: visibility.hiddenCwds,
  });
  const rows = db
    .query<SpendRow, [number, number, number]>(
      `SELECT (u.ts - ?1) / ?2 AS bucket, s.project_id, u.model, u.speed,
              SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
              SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h
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

/** Today's spend, the current rate, and the last three hours by project, as of `now`. */
export function liveSpend(db: Database, visibility: LiveVisibility, now: number): LiveSpend {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const today = visibleSpend(db, visibility, midnight, now, now - midnight + 1);
  const recent = visibleSpend(
    db,
    visibility,
    now - LIVE_RATE_WINDOW_MS,
    now,
    LIVE_RATE_WINDOW_MS + 1,
  );
  // Edges on whole 5 minutes, so they meet the hour ticks and hold still across refetches; the
  // last bucket is the one in progress and ends at `now`
  const from =
    Math.floor(now / SPEND_BUCKET_MS) * SPEND_BUCKET_MS - (SPEND_BUCKETS - 1) * SPEND_BUCKET_MS;
  const buckets: Map<number | null, number>[] = Array.from(
    { length: SPEND_BUCKETS },
    () => new Map(),
  );
  for (const b of visibleSpend(db, visibility, from, now, SPEND_BUCKET_MS)) {
    // Every response falls within the last bucket at the latest; the clamp is a guard
    const bucket = buckets[Math.min(b.bucket, SPEND_BUCKETS - 1)];
    bucket?.set(b.projectId, (bucket.get(b.projectId) ?? 0) + b.usd);
  }
  return {
    todayUsd: sum(today),
    perHourUsd: (sum(recent) * HOUR) / LIVE_RATE_WINDOW_MS,
    from,
    to: now,
    buckets: buckets.map((m) =>
      [...m]
        .filter(([, usd]) => usd > 0)
        .map(([projectId, usd]) => ({ projectId, usd }))
        .sort((a, b) => b.usd - a.usd),
    ),
    unpriced: today.some((b) => b.unpriced),
  };
}

/** Total of priced spend. */
function sum(list: BucketSpend[]): number {
  return list.reduce((n, b) => n + b.usd, 0);
}

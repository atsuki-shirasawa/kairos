// Token usage and its cost: the per-model totals the usage table is summed into, and how they
// become the API's `Usage`. The drawer's blocks and the live page both read it from here, so their
// costs agree.
import type { Database } from "bun:sqlite";
import type { Usage } from "../../shared/api.ts";
import { costOf } from "../pricing.ts";

/** Token totals for one model and speed, as the usage queries group them. */
export interface UsageRow {
  model: string;
  speed: string | null;
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
}

/** The usage table's token columns, summed into a `UsageRow` under the same names. */
const USAGE_COLUMNS = [
  "input",
  "output",
  "cache_read",
  "cache_write_5m",
  "cache_write_1h",
] as const;

/**
 * SQL select list summing each token column of the usage table (aliased `alias`, if given) into a
 * column of the same name, so every usage query yields the `UsageRow` shape.
 */
export function usageSums(alias?: string): string {
  const column = (c: string) => (alias ? `${alias}.${c}` : c);
  return USAGE_COLUMNS.map((c) => `SUM(${column(c)}) AS ${c}`).join(", ");
}

/** Combines per-model, per-speed totals into one and converts them to cost. */
export function toUsage(rows: UsageRow[]): Usage | null {
  if (rows.length === 0) return null;
  const u: Usage = {
    tokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    costUsd: 0,
    unpriced: false,
    model: null,
  };
  const outputByModel = new Map<string, number>();
  for (const r of rows) {
    const cacheWrite = r.cache_write_5m + r.cache_write_1h;
    u.input += r.input;
    u.output += r.output;
    u.cacheRead += r.cache_read;
    u.cacheWrite += cacheWrite;
    u.tokens += r.input + r.output + r.cache_read + cacheWrite;
    const cost = costOf(
      r.model,
      {
        input: r.input,
        output: r.output,
        cacheRead: r.cache_read,
        cacheWrite5m: r.cache_write_5m,
        cacheWrite1h: r.cache_write_1h,
      },
      r.speed,
    );
    if (cost === null) u.unpriced = true;
    else u.costUsd += cost;
    outputByModel.set(r.model, (outputByModel.get(r.model) ?? 0) + r.output);
  }
  u.model = [...outputByModel].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return u.tokens > 0 ? u : null;
}

/**
 * A session's token usage within a time range, subagents included and copies from a continued
 * session left out. Shared by the drawer's blocks and the live page, so their costs agree.
 * Automatic-run turns are outside work blocks, so a block's range never includes them.
 */
export function sessionUsage(
  db: Database,
  sessionId: string,
  from = 0,
  to = Number.MAX_SAFE_INTEGER,
): Usage | null {
  return toUsage(
    db
      .query<UsageRow, [string, number, number]>(
        `SELECT model, speed, ${usageSums()}
         FROM usage WHERE session_id = ? AND is_copy = 0 AND COALESCE(ts, 0) BETWEEN ? AND ?
         GROUP BY model, speed`,
      )
      .all(sessionId, from, to),
  );
}

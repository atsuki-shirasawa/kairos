// Token usage and its cost: the per-model totals the usage table is summed into, and how they
// become the API's `Usage`. The live page's SQL counts tokens and context with `tokensSql` and
// `contextSql` from here, so its totals agree with the drawer's.
import type { Database } from "bun:sqlite";
import type { Usage } from "../../shared/api.ts";
import { costOf } from "../pricing.ts";
import {
  BLOCK_COLUMNS,
  type BlockLookup,
  type BlockRef,
  type BlockSet,
  groupByBlock,
  lookupByBlock,
  ownRowsInBlock,
  withBlocks,
} from "./sql.ts";

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
  return USAGE_COLUMNS.map((c) => `SUM(${qualified(alias, c)}) AS ${c}`).join(", ");
}

/**
 * SQL expression for a usage row's tokens: every token column added up, the same total
 * `toUsage` counts as `tokens`.
 */
export function tokensSql(alias?: string): string {
  return USAGE_COLUMNS.map((c) => qualified(alias, c)).join(" + ");
}

/**
 * SQL expression for a response's context size: every token it read, which is all the columns but
 * `output` (what it wrote).
 */
export function contextSql(alias?: string): string {
  return USAGE_COLUMNS.filter((c) => c !== "output")
    .map((c) => qualified(alias, c))
    .join(" + ");
}

/** A row's tokens: every token column, as `tokensSql` adds them up in SQL. */
function rowTokens(r: UsageRow): number {
  return USAGE_COLUMNS.reduce((n, c) => n + r[c], 0);
}

/** A token column under the table alias, if any. */
function qualified(alias: string | undefined, column: string): string {
  return alias ? `${alias}.${column}` : column;
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
    u.tokens += rowTokens(r);
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
 * A session's whole token usage, subagents included and copies from a continued session left out.
 * Automatic runs outside work blocks count here, so it can exceed the sum of its blocks.
 */
export function sessionUsage(db: Database, sessionId: string): Usage | null {
  return toUsage(
    db
      .query<UsageRow, [string]>(
        `SELECT model, speed, ${usageSums()}
         FROM usage WHERE session_id = ? AND is_copy = 0
         GROUP BY model, speed`,
      )
      .all(sessionId),
  );
}

/** What each block of a set spent, from one pass over the usage table. */
export interface BlocksTokens {
  /** Token usage, counted like `sessionUsage` but within the block; null for a block that used none. */
  usage: BlockLookup<Usage | null>;
  /** The effort level behind most of the block's output, or null if none was recorded. */
  effort: BlockLookup<string | null>;
}

/**
 * Token usage and dominant effort of each block in the set, in one query (they read the same rows).
 * Automatic-run turns are outside work blocks, so a block never includes them.
 */
export function blocksTokens(db: Database, set: BlockSet): BlocksTokens {
  const rows = db
    .query<UsageRow & BlockRef & { effort: string | null }, (string | number)[]>(
      `${withBlocks(set)}
       SELECT ${BLOCK_COLUMNS}, u.model, u.speed, u.effort, ${usageSums("u")}
       FROM b CROSS JOIN usage u ON ${ownRowsInBlock("u")}
       GROUP BY b.session_id, b.start, u.model, u.speed, u.effort`,
    )
    .all(...set.params);
  const usage = new Map<string, Usage | null>();
  const effort = new Map<string, string | null>();
  for (const [key, group] of groupByBlock(rows)) {
    usage.set(key, toUsage(byModelAndSpeed(group)));
    effort.set(key, dominantEffort(group));
  }
  return { usage: lookupByBlock(usage, null), effort: lookupByBlock(effort, null) };
}

/**
 * Rows split by effort merged back into one per model and speed, so cost is computed from the same
 * totals as `sessionUsage` (summing per-effort costs would round differently).
 */
function byModelAndSpeed(rows: UsageRow[]): UsageRow[] {
  const merged = new Map<string, UsageRow>();
  for (const r of rows) {
    const key = `${r.model} ${r.speed}`;
    const m = merged.get(key);
    if (!m) merged.set(key, { ...r });
    else for (const c of USAGE_COLUMNS) m[c] += r[c];
  }
  return [...merged.values()].map(
    ({ model, speed, input, output, cache_read, cache_write_5m, cache_write_1h }) => ({
      model,
      speed,
      input,
      output,
      cache_read,
      cache_write_5m,
      cache_write_1h,
    }),
  );
}

/** The effort level with the most output among the rows, or null if none was recorded. */
function dominantEffort(rows: (UsageRow & { effort: string | null })[]): string | null {
  const output = new Map<string, number>();
  for (const r of rows) if (r.effort) output.set(r.effort, (output.get(r.effort) ?? 0) + r.output);
  return [...output].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Reads the billable token amounts out of an assistant record's message.usage.

import type { TokenCounts } from "../pricing.ts";
import { list, type Rec, rec } from "./records.ts";

/**
 * Token amounts of one response by billing category. With `usage.iterations`, the steps are summed: the
 * top-level fields cover only the `message` steps, so a server-side `compaction` step is billed but missing
 * from them, and some records zero them entirely while the steps still hold the amounts.
 */
export function usageCounts(usage: Rec): TokenCounts {
  const steps = list(usage.iterations)
    .map(rec)
    .filter((s) => s !== undefined);
  if (steps.length === 0) return stepCounts(usage);
  return steps.map(stepCounts).reduce(addCounts);
}

/** Amounts of one usage object (the top level or a single step) in the shared field layout. */
function stepCounts(u: Rec): TokenCounts {
  const breakdown = rec(u.cache_creation);
  return {
    input: count(u.input_tokens),
    output: count(u.output_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    // Without a breakdown, assume the default 5-minute cache write
    cacheWrite5m: breakdown
      ? count(breakdown.ephemeral_5m_input_tokens)
      : count(u.cache_creation_input_tokens),
    cacheWrite1h: count(breakdown?.ephemeral_1h_input_tokens),
  };
}

function addCounts(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
  };
}

/** Missing or malformed amounts count as zero. */
function count(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

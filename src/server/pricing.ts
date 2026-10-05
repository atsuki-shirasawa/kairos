// Converts token usage to USD using the API price list.
// It does not match what you actually pay when using Claude Code on a subscription; it is a gauge of usage.

/** USD per million tokens. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** Surcharge for fast mode (`usage.speed = "fast"`). Absent for models that do not support it. */
  fast?: number;
}

/**
 * Claude API prices as of 2026-09-25. Cache writes cost 1.25x input (5 min) or 2x (1 hour) for every model,
 * so they are not stored per model. Cache read multipliers differ by model.
 * Add new models here (models not listed are treated as unpriced).
 */
const PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-mythos-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, fast: 2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, fast: 2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;

/** Token counts by billing category. Cache writes are split by TTL since they cost differently. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** Price for a model ID. Dated IDs like `claude-haiku-4-5-20251001` are looked up by the longest matching name. */
export function priceOf(model: string): Price | null {
  let best: string | null = null;
  for (const name of Object.keys(PRICES)) {
    if ((model === name || model.startsWith(`${name}-`)) && name.length > (best?.length ?? 0))
      best = name;
  }
  return best ? (PRICES[best] ?? null) : null;
}

/** Amount in USD; null for models with unknown prices. */
export function costOf(model: string, t: TokenCounts, speed: string | null = null): number | null {
  const p = priceOf(model);
  if (!p) return null;
  const perToken =
    t.input * p.input +
    t.output * p.output +
    t.cacheRead * p.cacheRead +
    t.cacheWrite5m * p.input * CACHE_WRITE_5M +
    t.cacheWrite1h * p.input * CACHE_WRITE_1H;
  return (perToken / 1_000_000) * (speed === "fast" ? (p.fast ?? 1) : 1);
}

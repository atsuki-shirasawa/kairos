// API の料金表で、トークン使用量を米ドルに換算する。
// Claude Code をサブスクリプションで使っているときの実際の支払いとは一致しない。どれだけ使ったかの目安。

/** 100 万トークンあたりの米ドル。 */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  /** fast モード（`usage.speed = "fast"`）の割増。対応していないモデルは持たない。 */
  fast?: number;
}

/**
 * 2026-09-25 時点の Claude API の料金。キャッシュの書き込みは入力の 1.25 倍（5 分）・2 倍（1 時間）で、
 * どのモデルも同じなので持たない。読み込みはモデルごとに倍率が違う。
 * 新しいモデルが出たらここに足す（ないモデルは料金不明として扱う）。
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

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** モデル ID の料金。`claude-haiku-4-5-20251001` のような日付付きの ID は、いちばん長く一致する名前で引く。 */
export function priceOf(model: string): Price | null {
  let best: string | null = null;
  for (const name of Object.keys(PRICES)) {
    if ((model === name || model.startsWith(`${name}-`)) && name.length > (best?.length ?? 0))
      best = name;
  }
  return best ? (PRICES[best] ?? null) : null;
}

/** 米ドルでの額。料金の分からないモデルは null。 */
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

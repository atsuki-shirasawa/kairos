// トークン数・金額・モデル名の表示。
import type { Activity, Usage } from "@shared/api.ts";

/** 950 / 24.8k / 893k / 6.0M / 1.55B。桁の多い数を表の幅に収める（「1548.8M」は桁を読みにくい）。 */
export function tokensLabel(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 100_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/** $0.11 / $12.40 / $123。1 セント未満は「<$0.01」。 */
export function costLabel(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

/** `claude-opus-5-5` → `Opus 5.5`、`claude-haiku-4-5-20251001` → `Haiku 4.5`。知らない形はそのまま。 */
export function modelLabel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+(?:-\d+)?)(?:-\d{8})?$/.exec(model);
  if (!m?.[1] || !m[2]) return model;
  return `${m[1][0]?.toUpperCase()}${m[1].slice(1)} ${m[2].replace("-", ".")}`;
}

/** 入力のうちキャッシュから読んだ割合（0〜1）。入力がなければ null。 */
export function cacheRate(u: Pick<Usage, "input" | "cacheRead" | "cacheWrite">): number | null {
  const total = u.input + u.cacheRead + u.cacheWrite;
  return total > 0 ? u.cacheRead / total : null;
}

/** 使用量を足し合わせる（日・期間の合計）。モデルは合計では使わないので持たない。 */
export function sumUsage(list: (Usage | null)[]): Usage | null {
  const used = list.filter((u): u is Usage => u !== null);
  if (used.length === 0) return null;
  return used.reduce((a, b) => ({
    tokens: a.tokens + b.tokens,
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
    unpriced: a.unpriced || b.unpriced,
    model: null,
  }));
}

/** つまずき（ツールのエラー・中断・API のエラー）の合計。 */
export function troubleCount(a: Activity): number {
  return a.toolErrors + a.interrupts + a.apiErrors;
}

/** つまずきの内訳。0 のものは省く。 */
export function troubleDetail(a: Activity): string {
  return (
    [
      a.toolErrors && `ツールのエラー ${a.toolErrors}`,
      a.interrupts && `中断 ${a.interrupts}`,
      a.apiErrors && `API のエラー ${a.apiErrors}`,
    ]
      .filter(Boolean)
      .join("・") || "なし"
  );
}

/**
 * 活動を足し合わせる（日・期間の合計）。編集したファイルは延べ数になる。
 * Claude の稼働は、記録のあるものだけを足す（どれにも記録がなければ null）。effort は合計では使わない。
 */
export function sumActivity(list: (Activity | null)[]): Activity | null {
  const used = list.filter((a): a is Activity => a !== null);
  if (used.length === 0) return null;
  const withTurns = used.filter((a) => a.claudeMs !== null);
  return {
    commits: used.reduce((n, a) => n + a.commits, 0),
    prs: used.reduce((n, a) => n + a.prs, 0),
    filesEdited: used.reduce((n, a) => n + a.filesEdited, 0),
    toolCalls: used.reduce((n, a) => n + a.toolCalls, 0),
    subagents: used.reduce((n, a) => n + a.subagents, 0),
    toolErrors: used.reduce((n, a) => n + a.toolErrors, 0),
    interrupts: used.reduce((n, a) => n + a.interrupts, 0),
    apiErrors: used.reduce((n, a) => n + a.apiErrors, 0),
    compactions: used.reduce((n, a) => n + a.compactions, 0),
    claudeMs: withTurns.length ? withTurns.reduce((n, a) => n + (a.claudeMs ?? 0), 0) : null,
    effort: null,
  };
}

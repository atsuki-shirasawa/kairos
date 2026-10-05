import type { ReactNode } from "react";
import { defineMessages } from "../index.ts";

const COST_NOTE_EN = "Estimated from API list prices (not what a subscription actually costs)";
const COST_NOTE_JA = "API の料金表で換算した目安（サブスクリプションでの支払いとは一致しない）";

export type ColumnKey =
  | "duration"
  | "claude"
  | "prompts"
  | "tokens"
  | "cost"
  | "cache"
  | "outcomes"
  | "files"
  | "trouble"
  | "model";

/** Typed so that both languages name every column of `COLUMNS` in components/SessionList.tsx. */
const columns = (c: Record<ColumnKey, { label: string; title?: string }>) => c;

export const listMessages = defineMessages({
  en: {
    costNote: COST_NOTE_EN,
    costNoteUnpriced: `${COST_NOTE_EN}. Excludes models with unknown prices`,
    columns: columns({
      duration: { label: "Duration" },
      claude: {
        label: "Claude",
        title:
          "Time Claude spent running turns (thinking, running tools). The rest is time spent reading and thinking. Daily totals add up parallel sessions",
      },
      prompts: { label: "Prompts" },
      tokens: { label: "Tokens" },
      cost: { label: "Cost", title: COST_NOTE_EN },
      cache: { label: "Cache", title: "Share of input read from the cache" },
      outcomes: { label: "Results", title: "Number of commits and PRs" },
      files: { label: "Edits", title: "Number of files edited" },
      trouble: { label: "Snags", title: "Tool errors, interrupts, and API errors combined" },
      model: { label: "Model" },
    }),
    time: "Time",
    work: "Work",
    sortBy: (label: string) => `Sort by ${label}`,
    noRecords: "No records",
    showDay: "Show this day",
    fromPreviousDay: "From the day before",
    toNextDay: "Continues next day",
    tokensDetail: (input: string, output: string, cacheRead: string, cacheWrite: string) =>
      `Input ${input} / Output ${output} / Cache read ${cacheRead} / Cache write ${cacheWrite}`,
    filesDetail: (toolCalls: number, subagents: number) =>
      `${toolCalls} tool calls · ${subagents} subagents`,
    claudeTotalNote: "Includes parallel sessions, so it can exceed the working time",
    /** The period summary above the table. Arguments are already-styled numbers. */
    period: (single: boolean, count: number, blocks: ReactNode, busy: ReactNode) => (
      <>
        {single ? "This day" : "This week"}: {blocks} {count === 1 ? "block" : "blocks"} · {busy} of
        work
      </>
    ),
    claudeTotal: (ms: ReactNode) => <> (Claude {ms} total)</>,
    tokensCost: (tokens: ReactNode, cost: ReactNode) => (
      <>
        {tokens} tokens · {cost} at API prices
      </>
    ),
    commitsPrs: (commits: ReactNode, prs: ReactNode) => (
      <>
        Commits {commits} · PRs {prs}
      </>
    ),
  },
  ja: {
    costNote: COST_NOTE_JA,
    costNoteUnpriced: `${COST_NOTE_JA}。料金の分からないモデルの分を含まない`,
    columns: columns({
      duration: { label: "長さ" },
      claude: {
        label: "Claude",
        title:
          "Claude がターンを進めていた時間（考える・ツールを動かす）。残りは人が読む・考える時間。日の合計は並行したセッションの分も足した延べ",
      },
      prompts: { label: "発言" },
      tokens: { label: "トークン" },
      cost: { label: "コスト", title: COST_NOTE_JA },
      cache: { label: "キャッシュ", title: "入力のうちキャッシュから読んだ割合" },
      outcomes: { label: "成果", title: "コミットと PR の数" },
      files: { label: "編集", title: "書き換えたファイルの数" },
      trouble: { label: "つまずき", title: "ツールのエラー・中断・API のエラーの合計" },
      model: { label: "モデル" },
    }),
    time: "時刻",
    work: "作業",
    sortBy: (label: string) => `${label}で並べ替え`,
    noRecords: "記録なし",
    showDay: "この日を表示",
    fromPreviousDay: "前日から",
    toNextDay: "翌日へ",
    tokensDetail: (input: string, output: string, cacheRead: string, cacheWrite: string) =>
      `入力 ${input} / 出力 ${output} / キャッシュ読み込み ${cacheRead} / キャッシュ書き込み ${cacheWrite}`,
    filesDetail: (toolCalls: number, subagents: number) =>
      `ツール呼び出し ${toolCalls} 回・サブエージェント ${subagents}`,
    claudeTotalNote: "並行して進めたセッションの分も足すので、作業時間より長くなることがある",
    period: (single: boolean, _count: number, blocks: ReactNode, busy: ReactNode) => (
      <>
        {single ? "この日" : "この週"}: {blocks} 件・作業 {busy}
      </>
    ),
    claudeTotal: (ms: ReactNode) => <>（Claude 延べ {ms}）</>,
    tokensCost: (tokens: ReactNode, cost: ReactNode) => (
      <>
        {tokens} トークン・API 料金換算 {cost}
      </>
    ),
    commitsPrs: (commits: ReactNode, prs: ReactNode) => (
      <>
        コミット {commits}・PR {prs}
      </>
    ),
  },
});

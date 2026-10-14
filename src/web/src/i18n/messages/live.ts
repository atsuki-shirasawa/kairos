import type { LiveColumn, LiveDisplay } from "@/lib/live.ts";
import { defineMessages } from "../index.ts";

/** Short status-board names, shared by both languages: they read as states, like "Live". */
const COLUMNS: Record<LiveColumn, string> = {
  attention: "On you",
  working: "Working",
  idle: "Idle",
};

/** The page of running sessions and the toolbar button that opens it. */
export const liveMessages = defineMessages({
  en: {
    button: "Live",
    /** The toolbar button's name: how many sessions run and how many want an answer. */
    buttonLabel: (attention: number, running: number) =>
      `Live: ${running === 1 ? "1 session" : `${running} sessions`} running${attention ? `, ${attention} waiting on you` : ""}`,
    /** The button's tooltip: its name and its key. */
    buttonTitle: (label: string) => `${label} (n)`,
    heading: "Running sessions",
    columns: COLUMNS,
    columnNote: {
      attention: "Waiting for your answer or your next prompt",
      working: "Claude is working",
      idle: (minutes: number) =>
        `Nothing for ${minutes === 1 ? "1 minute" : `${minutes} minutes`} or more`,
    },
    nothingRunning: "No Claude Code session is running.",
    /** An empty On you column. */
    nothingOnYou: "Nothing is waiting on you",
    unavailable:
      "Can't read Claude Code's record of running sessions (~/.claude/sessions). Run kairos doctor.",
    state: {
      asking: "Asking you",
      waiting: "Waiting",
      working: "Working",
      idle: "Idle",
    } satisfies Record<LiveDisplay, string>,
    /** The state with how long it has lasted ("Waiting · 3m"), for screen readers. */
    status: (state: string, duration: string) => `${state} · ${duration}`,
    background: "Background",
    tasks: (done: number, total: number) => `Tasks ${done}/${total}`,
    testPassed: "Last test passed",
    testFailed: "Last test failed",
    testEnded: "Last test ran",
    context: (tokens: string) => `Context ${tokens}`,
    /** The context size against the model's window ("Context 148k / 1M"). */
    contextOf: (tokens: string, window: string) => `Context ${tokens} / ${window}`,
    startedAt: (time: string) => `Started ${time}`,
    notIngested: "Not in the log yet",
    /** What the current work block has cost so far. */
    blockCost: (cost: string) => `This block ${cost}`,
    fast: "Fast",
    cacheLeft: (left: string) => `Cache ${left} left`,
    cacheExpired: "Cache expired",
    /** What a reply costs now, and what it costs once the cache has lapsed. */
    nextCost: (warm: string, cold: string) => `Next ≈ ${warm}, ${cold} once it expires`,
    /** The first request after the cache lapsed: it writes the whole context again. */
    resumeCost: (cost: string) => `Resume ≈ ${cost}`,
    spend: {
      today: "Today",
      /** The spend rate over the last minutes. */
      rate: "Rate",
      /** The chart's right end, the current time. */
      now: "Now",
      /** The band's caveat, said once for every amount on the page. */
      note: "Estimated at API list prices, not your bill",
      unpriced: "Models without a price are left out",
      /** Above the bars while none is pointed at. */
      window: (hours: number) => (hours === 1 ? "Last hour" : `Last ${hours} hours`),
      /** Spend of sessions not tied to a project, in a pointed bar's split. */
      noProject: "No project",
      /** The bars, for screen readers. */
      chart: (from: string, to: string) => `Spend by project from ${from} to ${to}`,
      bar: (from: string, to: string, cost: string) => `${from}–${to} ${cost}`,
      /** A bar with its split by project ("atlas $0.80"), for screen readers. */
      barSplit: (bar: string, parts: string[]) => `${bar}: ${parts.join(", ")}`,
    },
  },
  ja: {
    button: "Live",
    buttonLabel: (attention: number, running: number) =>
      `Live: 起動中のセッション ${running} 件${attention ? `、うち ${attention} 件が要対応` : ""}`,
    buttonTitle: (label: string) => `${label} (n)`,
    heading: "起動中のセッション",
    columns: COLUMNS,
    columnNote: {
      attention: "質問への回答か、次の指示を待っています",
      working: "Claude が作業しています",
      idle: (minutes: number) => `${minutes} 分以上操作がありません`,
    },
    nothingRunning: "起動中の Claude Code セッションはありません。",
    nothingOnYou: "対応待ちはありません",
    unavailable:
      "Claude Code の起動中セッションの記録（~/.claude/sessions）を読めません。kairos doctor を実行してください。",
    state: {
      asking: "質問あり",
      waiting: "指示待ち",
      working: "作業中",
      idle: "休止中",
    } satisfies Record<LiveDisplay, string>,
    status: (state: string, duration: string) => `${state}・${duration}`,
    background: "バックグラウンド",
    tasks: (done: number, total: number) => `タスク ${done}/${total}`,
    testPassed: "直近のテストは成功",
    testFailed: "直近のテストは失敗",
    testEnded: "直近のテストを実行",
    context: (tokens: string) => `コンテキスト ${tokens}`,
    contextOf: (tokens: string, window: string) => `コンテキスト ${tokens} / ${window}`,
    startedAt: (time: string) => `${time} 開始`,
    notIngested: "まだログに記録されていません",
    blockCost: (cost: string) => `このブロック ${cost}`,
    fast: "Fast",
    cacheLeft: (left: string) => `キャッシュ残り ${left}`,
    cacheExpired: "キャッシュ切れ",
    nextCost: (warm: string, cold: string) => `次 ≈ ${warm}、切れた後は ${cold}`,
    resumeCost: (cost: string) => `再開 ≈ ${cost}`,
    spend: {
      today: "今日",
      rate: "ペース",
      now: "現在",
      note: "API 定価での推定で、実際の請求額ではありません",
      unpriced: "価格不明のモデルの分は含みません",
      window: (hours: number) => `直近 ${hours} 時間`,
      noProject: "プロジェクトなし",
      chart: (from: string, to: string) => `${from}〜${to} のプロジェクト別の支出`,
      bar: (from: string, to: string, cost: string) => `${from}〜${to} ${cost}`,
      barSplit: (bar: string, parts: string[]) => `${bar}：${parts.join("、")}`,
    },
  },
});

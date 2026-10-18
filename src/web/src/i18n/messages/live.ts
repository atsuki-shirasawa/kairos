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
    /** The button's tooltip: its name and the key of Today, which it opens. */
    buttonTitle: (label: string, key: string) => `${label} (${key})`,
    columns: COLUMNS,
    /** What puts a session among the idle ones. */
    idleNote: (minutes: number) =>
      `Nothing for ${minutes === 1 ? "1 minute" : `${minutes} minutes`} or more`,
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
    /** A subagent whose type isn't known yet. */
    subagent: "Subagent",
    /** The card's list of subagents, for screen readers. */
    subagents: "Subagents",
    /** A subagent that finished a moment ago, in place of how long it runs. */
    agentDone: "Done",
    /** Subagents past the ones a card lists. */
    agentsMore: (n: number) => `+${n} more`,
    /** An idle row's count of subagents still running. */
    agentsRunning: (n: number) => (n === 1 ? "1 subagent running" : `${n} subagents running`),
    /** The tokens of the current work block so far. */
    blockTokens: (tokens: string) => `This block ${tokens}`,
    fast: "Fast",
    cacheLeft: (left: string) => `Cache ${left} left`,
    cacheExpired: "Cache expired",
    tokens: {
      today: "Tokens today",
      /** Tokens per hour over the last minutes. */
      rate: "Rate",
      /** The chart's right end, the current time. */
      now: "Now",
      /** The band's one note: why the totals run so large. */
      note: "Cache reads included, usually most of the total",
      /** Above the chart while nothing is pointed at: what pointing shows. */
      hint: (minutes: number) => `Point at the chart for a ${minutes}-minute breakdown`,
      /** A project's share of the chart, for screen readers ("atlas 210M"). */
      layer: (name: string, tokens: string) => `${name} ${tokens}`,
      /** Tokens of sessions not tied to a project, in the chart's labels and a slot's split. */
      noProject: "No project",
      /** The chart, for screen readers. */
      chart: (from: string, to: string) => `Tokens by project from ${from} to ${to}`,
      /** A slot of the chart and what it added. */
      slot: (from: string, to: string, tokens: string) => `${from}–${to} +${tokens}`,
      /** A slot with its split by project ("atlas 1.2M"), for screen readers. */
      slotSplit: (slot: string, parts: string[]) => `${slot}: ${parts.join(", ")}`,
    },
  },
  ja: {
    button: "Live",
    buttonLabel: (attention: number, running: number) =>
      `Live: 起動中のセッション ${running} 件${attention ? `、うち ${attention} 件が要対応` : ""}`,
    buttonTitle: (label: string, key: string) => `${label} (${key})`,
    columns: COLUMNS,
    idleNote: (minutes: number) => `${minutes} 分以上操作がありません`,
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
    subagent: "サブエージェント",
    subagents: "サブエージェント",
    agentDone: "完了",
    agentsMore: (n: number) => `ほか ${n} 件`,
    agentsRunning: (n: number) => `サブエージェント ${n} 件実行中`,
    blockTokens: (tokens: string) => `このブロック ${tokens}`,
    fast: "Fast",
    cacheLeft: (left: string) => `キャッシュ残り ${left}`,
    cacheExpired: "キャッシュ切れ",
    tokens: {
      today: "今日のトークン",
      rate: "ペース",
      now: "現在",
      note: "キャッシュ読み込みを含みます（多くの場合、合計の大半）",
      hint: (minutes: number) => `グラフを指すと ${minutes} 分ごとの内訳を表示`,
      layer: (name: string, tokens: string) => `${name} ${tokens}`,
      noProject: "プロジェクトなし",
      chart: (from: string, to: string) => `${from}〜${to} のプロジェクト別のトークン`,
      slot: (from: string, to: string, tokens: string) => `${from}〜${to} +${tokens}`,
      slotSplit: (slot: string, parts: string[]) => `${slot}：${parts.join("、")}`,
    },
  },
});

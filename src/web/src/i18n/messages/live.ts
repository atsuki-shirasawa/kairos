import type { LiveColumn, LiveDisplay } from "@/lib/live.ts";
import { defineMessages } from "../index.ts";

/** The page of running sessions and the toolbar button that opens it. */
export const liveMessages = defineMessages({
  en: {
    button: "Live",
    /** The toolbar button's name: how many sessions run and how many want an answer. */
    buttonLabel: (attention: number, running: number) =>
      `Live: ${running === 1 ? "1 session" : `${running} sessions`} running${attention ? `, ${attention} waiting on you` : ""}`,
    /** The button's tooltip: its name and its key. */
    buttonTitle: (label: string) => `${label} (n)`,
    heading: "Running now",
    columns: {
      attention: "Waiting on you",
      working: "Working",
      idle: "Idle",
    } satisfies Record<LiveColumn, string>,
    columnNote: {
      attention: "Asking a question, or done with its turn",
      working: "Running a turn",
      idle: (minutes: number) =>
        `Waiting ${minutes === 1 ? "1 minute" : `${minutes} minutes`} or more`,
    },
    nothingRunning: "No Claude Code session is running.",
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
    startedAt: (time: string) => `Started ${time}`,
    notIngested: "Not in the log yet",
  },
  ja: {
    button: "Live",
    buttonLabel: (attention: number, running: number) =>
      `Live: 実行中のセッション ${running} 件${attention ? `、うち ${attention} 件があなた待ち` : ""}`,
    buttonTitle: (label: string) => `${label} (n)`,
    heading: "実行中",
    columns: {
      attention: "あなた待ち",
      working: "作業中",
      idle: "アイドル",
    } satisfies Record<LiveColumn, string>,
    columnNote: {
      attention: "質問している、またはターンを終えた",
      working: "ターンを実行している",
      idle: (minutes: number) => `${minutes} 分以上入力を待っている`,
    },
    nothingRunning: "実行中の Claude Code セッションはありません。",
    unavailable:
      "Claude Code の実行中セッションの記録（~/.claude/sessions）を読めません。kairos doctor を実行してください。",
    state: {
      asking: "質問中",
      waiting: "入力待ち",
      working: "作業中",
      idle: "アイドル",
    } satisfies Record<LiveDisplay, string>,
    status: (state: string, duration: string) => `${state}・${duration}`,
    background: "バックグラウンド",
    tasks: (done: number, total: number) => `タスク ${done}/${total}`,
    testPassed: "直近のテストは成功",
    testFailed: "直近のテストは失敗",
    testEnded: "直近のテストを実行",
    context: (tokens: string) => `コンテキスト ${tokens}`,
    startedAt: (time: string) => `${time} 開始`,
    notIngested: "まだログに記録されていません",
  },
});

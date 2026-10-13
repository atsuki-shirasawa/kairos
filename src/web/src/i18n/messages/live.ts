import type { LiveDisplay } from "@/lib/live.ts";
import { defineMessages } from "../index.ts";

/** The row of running sessions under the toolbar and its tooltips. */
export const liveMessages = defineMessages({
  en: {
    rowLabel: "Running sessions",
    state: {
      asking: "Asking you",
      waiting: "Waiting",
      working: "Working",
      idle: "Idle",
    } satisfies Record<LiveDisplay, string>,
    /** The state with how long it has lasted ("Waiting · 3m"), for the tooltip and screen readers. */
    status: (state: string, duration: string) => `${state} · ${duration}`,
    background: "Background",
    tool: (name: string, text: string) => (text ? `${name}: ${text}` : name),
    question: (q: string) => `Asks: ${q}`,
    tasks: (done: number, total: number) => `Tasks ${done}/${total}`,
    currentTask: (subject: string) => `Now: ${subject}`,
    testPassed: (command: string) => `Last test passed: ${command}`,
    testFailed: (command: string) => `Last test failed: ${command}`,
    testEnded: (command: string) => `Last test ran: ${command}`,
    context: (tokens: string) => `Context ${tokens} tokens`,
    recap: (text: string) => `Recap: ${text}`,
    open: "Click to open its latest work block",
    notIngested: "Not in the log yet",
  },
  ja: {
    rowLabel: "実行中のセッション",
    state: {
      asking: "質問中",
      waiting: "入力待ち",
      working: "作業中",
      idle: "アイドル",
    } satisfies Record<LiveDisplay, string>,
    status: (state: string, duration: string) => `${state}・${duration}`,
    background: "バックグラウンド",
    tool: (name: string, text: string) => (text ? `${name}: ${text}` : name),
    question: (q: string) => `質問: ${q}`,
    tasks: (done: number, total: number) => `タスク ${done}/${total}`,
    currentTask: (subject: string) => `いま: ${subject}`,
    testPassed: (command: string) => `直近のテストは成功: ${command}`,
    testFailed: (command: string) => `直近のテストは失敗: ${command}`,
    testEnded: (command: string) => `直近のテストを実行: ${command}`,
    context: (tokens: string) => `コンテキスト ${tokens} トークン`,
    recap: (text: string) => `要約: ${text}`,
    open: "クリックで最新の作業ブロックを開く",
    notIngested: "まだログに記録されていません",
  },
});

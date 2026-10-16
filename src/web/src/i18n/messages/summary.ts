import type { View } from "@/lib/view.ts";
import { defineMessages } from "../index.ts";
import { THIS_EN, THIS_JA, UNIT_EN } from "../period.ts";

type Unit = View;

const BEFORE_EN: Record<Unit, [whole: string, soFar: string]> = {
  month: ["last month", "this point last month"],
  week: ["last week", "this point last week"],
  day: ["the day before", "this time the day before"],
};
const before = (u: Unit, soFar: boolean) => BEFORE_EN[u][soFar ? 1 : 0];
const beforeJa = (u: Unit, soFar: boolean) =>
  `${{ month: "先月", week: "先週", day: "前日" }[u]}${soFar ? "の同じ時点" : ""}`;

/** The summary view: period totals, where the time went, and what was done. */
export const summaryMessages = defineMessages({
  en: {
    region: (u: Unit) => `This ${UNIT_EN[u]}'s summary`,
    tabs: "How to show the summary",
    overview: "Overview",
    table: "Table",
    working: "Working time",
    claude: (duration: string) => `Claude ${duration}`,
    claudeNote: "Time Claude spent running turns. Includes parallel sessions",
    prs: "PRs",
    commits: "Commits",
    tokens: "Tokens",
    cost: "Cost",
    /**
     * Change from the previous period. `delta` is already signed ("+2h", "−3"). `soFar`: the
     * period is still running, so it is compared with the previous one up to the same point.
     */
    versus: (u: Unit, delta: string, soFar: boolean) => `${delta} vs ${before(u, soFar)}`,
    unchanged: (u: Unit, soFar: boolean) => `Same as ${before(u, soFar)}`,
    byDay: "By day",
    dayTick: (weekday: string, date: number) => `${weekday} ${date}`,
    /** A month's day bar on hover, since its bar is too narrow to print the duration. */
    dayBarTitle: (date: string, duration: string) => `${date} · ${duration}`,
    outcomes: "Commits · PRs",
    throughDay: "Through the day",
    byProject: "By project",
    /** Under "By project" when time on parallel projects adds up to more than the working time. */
    overlap: (busy: string) =>
      `Time spent on several projects at once counts for each, so these add up to more than the ${busy} of working time`,
    done: "What you did",
    recapWrite: "Summarize this work",
    recapAbout: "About this summary",
    recapWriteAll: "Summarize every project",
    recapRewrite: "Regenerate",
    recapWriting: "Summarizing…",
    recapStale: "Work continued after this summary",
    recapFailed: (message: string) => `Couldn't summarize: ${message}`,
    recapFailedHint: (hint: string) => `Couldn't summarize. ${hint}`,
    recapFailedDetail: (error: string) => `Details: ${error}`,
    recapNote:
      "Summarized by Claude from this period's section summaries. Sections without a summary add only their headline",
    noTime: "—",
    /** Heading of a project's open items under its recap, with how many are open at the end. */
    openHeading: (n: number) => `Open (${n})`,
    /** How many were left open and closed during the period, beside the heading. */
    openDelta: (u: Unit, opened: number, closed: number) => `+${opened} / −${closed} ${THIS_EN[u]}`,
    openDeltaNote: (u: Unit) => `Left open ${THIS_EN[u]} / closed ${THIS_EN[u]}`,
    /** How long an item has been open, in its first week: the date it was left open. */
    openSince: (date: string) => `since ${date}`,
    /** How long an item has been open, from its second week on. */
    openWeek: (n: number) => `week ${n}`,
    /** The folded group of items open for `weeks` weeks or more. */
    openOld: (weeks: number, n: number) => `Open ${weeks} weeks or more (${n})`,
    openClosed: (u: Unit, n: number) => `Closed ${THIS_EN[u]} (${n})`,
    openShow: "Open the block that left it",
    closedShow: "Open the block that closed it",
    markDone: "Mark as done",
    dismiss: "Won't do",
    markMistaken: "Not an open item",
    reopen: "Reopen",
    /** How a closed item was closed. `what` is what the log showed (`logClosedIssue`, …). */
    closedByRef: (what: string | null) => (what ? `In the log: ${what}` : "Closed in the log"),
    /** What the log showed settle an item: an issue closed, a PR merged, a task completed. */
    logClosedIssue: (ref: string) => `closed ${ref}`,
    logMerged: (ref: string) => `merged PR ${ref}`,
    logTaskDone: (ref: string) => `task ${ref} completed`,
    logList: (parts: string[]) => parts.join(", "),
    closedByModel: "Settled in a later block",
    closedByUser: "Marked done",
    closedDismissed: "Won't do",
    closedMistaken: "Not an open item",
    openUpdateFailed: (message: string) => `Couldn't update: ${message}`,
  },
  ja: {
    region: (u: Unit) => `${THIS_JA[u]}のまとめ`,
    tabs: "まとめの表示方法",
    overview: "概要",
    table: "表",
    working: "作業時間",
    claude: (duration: string) => `Claude ${duration}`,
    claudeNote: "Claude がターンを実行していた時間。並行セッションの分も含む",
    prs: "PR",
    commits: "コミット",
    tokens: "トークン",
    cost: "コスト",
    versus: (u: Unit, delta: string, soFar: boolean) => `${beforeJa(u, soFar)}より ${delta}`,
    unchanged: (u: Unit, soFar: boolean) => `${beforeJa(u, soFar)}と同じ`,
    byDay: "日ごと",
    dayTick: (weekday: string, date: number) => `${date}（${weekday}）`,
    dayBarTitle: (date: string, duration: string) => `${date}・${duration}`,
    outcomes: "コミット・PR",
    throughDay: "1日の流れ",
    byProject: "プロジェクトごと",
    overlap: (busy: string) =>
      `並行して進めた時間はそれぞれのプロジェクトに数えるため、合計は作業時間（${busy}）より長くなります`,
    done: "やったこと",
    recapWrite: "この作業を要約する",
    recapAbout: "この要約について",
    recapWriteAll: "すべてのプロジェクトを要約する",
    recapRewrite: "作り直す",
    recapWriting: "要約を作成中…",
    recapStale: "要約の後も作業が続いています",
    recapFailed: (message: string) => `要約できませんでした: ${message}`,
    recapFailedHint: (hint: string) => `要約できませんでした。${hint}`,
    recapFailedDetail: (error: string) => `詳細: ${error}`,
    recapNote:
      "この期間のセクション要約をもとに Claude がまとめました。要約のないセクションは見出しだけを使います",
    noTime: "—",
    openHeading: (n: number) => `残課題（${n}）`,
    openDelta: (u: Unit, opened: number, closed: number) => `${THIS_JA[u]} +${opened} / −${closed}`,
    openDeltaNote: (u: Unit) => `${THIS_JA[u]}に残した数 / 閉じた数`,
    openSince: (date: string) => `${date}から`,
    openWeek: (n: number) => `${n}週目`,
    openOld: (weeks: number, n: number) => `${weeks}週以上続いているもの（${n}）`,
    openClosed: (u: Unit, n: number) => `${THIS_JA[u]}に閉じたもの（${n}）`,
    openShow: "残したブロックを開く",
    closedShow: "閉じたブロックを開く",
    markDone: "完了にする",
    dismiss: "やらないことにする",
    markMistaken: "残課題ではない",
    reopen: "元に戻す",
    closedByRef: (what: string | null) => (what ? `ログ: ${what}` : "ログで完了"),
    logClosedIssue: (ref: string) => `${ref} をクローズ`,
    logMerged: (ref: string) => `PR ${ref} をマージ`,
    logTaskDone: (ref: string) => `タスク ${ref} を完了`,
    logList: (parts: string[]) => parts.join("、"),
    closedByModel: "後のブロックで解決",
    closedByUser: "完了にした",
    closedDismissed: "やらないことにした",
    closedMistaken: "残課題ではなかった",
    openUpdateFailed: (message: string) => `更新できませんでした: ${message}`,
  },
});

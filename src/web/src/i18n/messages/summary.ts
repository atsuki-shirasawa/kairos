import type { View } from "@/lib/dates.ts";
import { defineMessages } from "../index.ts";
import { THIS_JA, UNIT_EN } from "../period.ts";

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
    dayBarTitle: (date: string, duration: string) => `${date}　${duration}`,
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
  },
});

import { defineMessages } from "../index.ts";

type Unit = "week" | "day";

const before = (u: Unit, soFar: boolean) =>
  u === "week"
    ? soFar
      ? "this point last week"
      : "last week"
    : soFar
      ? "this time the day before"
      : "the day before";
const beforeJa = (u: Unit, soFar: boolean) =>
  `${u === "week" ? "先週" : "前日"}${soFar ? "の同じ時点" : ""}`;

/** The summary view: period totals, where the time went, and what was done. */
export const summaryMessages = defineMessages({
  en: {
    region: (u: Unit) => (u === "week" ? "This week's summary" : "This day's summary"),
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
    outcomes: "Commits · PRs",
    throughDay: "Through the day",
    byProject: "By project",
    /** Under "By project" when time on parallel projects adds up to more than the working time. */
    overlap: (busy: string) =>
      `Time spent on several projects at once counts for each, so these add up to more than the ${busy} of working time`,
    done: "What you did",
    recapWrite: "Explain this work",
    recapAbout: "About this explanation",
    recapWriteAll: "Explain every project",
    recapRewrite: "Rewrite",
    recapWriting: "Writing the explanation…",
    recapStale: "More work came in after this was written",
    recapFailed: (message: string) => `Couldn't write it: ${message}`,
    recapFailedHint: (hint: string) => `Couldn't write the explanation. ${hint}`,
    recapFailedDetail: (error: string) => `Details: ${error}`,
    recapNote:
      "Written by Claude from this period's section summaries. Sections without a summary add only their headline",
    noTime: "—",
  },
  ja: {
    region: (u: Unit) => `${u === "week" ? "この週" : "この日"}のまとめ`,
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
    outcomes: "コミット・PR",
    throughDay: "1日の流れ",
    byProject: "プロジェクトごと",
    overlap: (busy: string) =>
      `並行して進めた時間はそれぞれのプロジェクトに数えるため、合計は作業時間（${busy}）より長くなります`,
    done: "やったこと",
    recapWrite: "この作業を説明する",
    recapAbout: "この説明について",
    recapWriteAll: "すべてのプロジェクトを説明する",
    recapRewrite: "書き直す",
    recapWriting: "説明を書いています…",
    recapStale: "書いた後に作業が増えています",
    recapFailed: (message: string) => `説明を書けませんでした：${message}`,
    recapFailedHint: (hint: string) => `説明を書けませんでした。${hint}`,
    recapFailedDetail: (error: string) => `詳細: ${error}`,
    recapNote:
      "この期間のセクション要約をもとに Claude が書きました。要約のないセクションは見出しだけを使います",
    noTime: "—",
  },
});

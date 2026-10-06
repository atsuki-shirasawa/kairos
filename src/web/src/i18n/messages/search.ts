import type { SearchField } from "@shared/api.ts";
import { defineMessages } from "../index.ts";

type Unit = "week" | "day";

/** The search field in the header and its results across every period. */
export const searchMessages = defineMessages({
  en: {
    placeholder: "Search work",
    label: (u: Unit) =>
      `Search all work by summary, prompt, PR, commit or branch, or by edited file with file:path. Filters ${u === "week" ? "this week" : "this day"} too`,
    clear: "Clear search",
    clearTitle: "Clear search (Esc)",
    allPeriods: "All periods",
    /** When more matched than were returned; otherwise the count uses `formatMessages().blocks`. */
    latest: (n: number) => `Latest ${n}`,
    searching: "Searching…",
    noHits: "Nothing found. Try another word, such as a PR number or branch name",
    failed: (message: string) => `Search failed: ${message}`,
    tooShort: (n: number) => `Type at least ${n} characters to search all periods`,
    keys: "↓ to pick · Enter to open",
    fileHint: "Turn on the file button (or type file:path) to find the work that edited a file",
    fileToggle: "Search edited files",
    filePlaceholder: "Search by file path",
    /** Where the match was found. */
    field: {
      headline: "Headline",
      summary: "Summary",
      title: "Session title",
      branch: "Branch",
      pr: "PR",
      commit: "Commit",
      prompt: "Your prompt",
      reply: "Claude's reply",
      file: "Edited file",
    } satisfies Record<SearchField, string>,
  },
  ja: {
    placeholder: "作業を探す",
    label: (u: Unit) =>
      `すべての作業を要約・発言・PR・コミット・ブランチで探す。file:<パス> で編集したファイルからも探せる。${u === "week" ? "この週" : "この日"}の表示も絞り込む`,
    clear: "検索を消す",
    clearTitle: "検索を消す（Esc）",
    allPeriods: "すべての期間",
    latest: (n: number) => `新しい順に ${n} 件`,
    searching: "探しています…",
    noHits: "見つかりませんでした。PR 番号やブランチ名など、別の言葉で試してください",
    failed: (message: string) => `検索できませんでした: ${message}`,
    tooShort: (n: number) => `すべての期間から探すには ${n} 文字以上入力してください`,
    keys: "↓ で選ぶ・Enter で開く",
    fileHint:
      "ファイルのボタンをオンにする（または file:<パス> と書く）と、そのファイルを編集した作業を探せます",
    fileToggle: "編集したファイルで探す",
    filePlaceholder: "ファイルのパスで探す",
    field: {
      headline: "見出し",
      summary: "要約",
      title: "セッション名",
      branch: "ブランチ",
      pr: "PR",
      commit: "コミット",
      prompt: "あなたの発言",
      reply: "Claude の返答",
      file: "編集したファイル",
    },
  },
});

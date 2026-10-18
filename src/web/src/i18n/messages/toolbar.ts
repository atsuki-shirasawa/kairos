import type { View } from "@/lib/view.ts";
import { defineMessages } from "../index.ts";
import { UNIT_EN, UNIT_JA } from "../period.ts";

type Unit = View;

/** The period holding today, by its unit. */
const CURRENT_EN: Record<Unit, string> = { month: "This month", week: "This week", day: "Today" };
const CURRENT_JA: Record<Unit, string> = { month: "今月", week: "今週", day: "今日" };

/** The header: navigation, view toggles, search, the "⋯" menu and the import progress. */
export const toolbarMessages = defineMessages({
  en: {
    prev: (u: Unit) => `Previous ${UNIT_EN[u]}`,
    next: (u: Unit) => `Next ${UNIT_EN[u]}`,
    today: "Today",
    /**
     * The period button, which moves the period to the one holding today, named by its unit so
     * that only the day view shares the Today page's name (and means much the same there).
     */
    current: (u: Unit) => CURRENT_EN[u],
    viewToggle: "View",
    month: "Month",
    week: "Week",
    day: "Day",
    viewTitle: "Month, week or day (m / w / d)",
    layoutToggle: "Calendar or insights",
    calendar: "Calendar",
    summary: "Insights",
    /** Switches between the two places; both names are kept in English in both languages. */
    placeToggle: "Today or Journal",
    journal: "Journal",
    /** The mark and wordmark, which lead to the home page, named apart from the place toggle's "Today". */
    home: "Today page",
    menu: "Display settings and keyboard shortcuts",
    menuTitle: "Display settings and keyboard shortcuts (?)",
    theme: "Theme",
    themeSystem: "Match system",
    themeLight: "Light",
    themeDark: "Dark",
    language: "Language",
    headlessRuns: "Headless runs",
    headlessRunsTitle:
      "Sessions started by claude -p or the Agent SDK, with no prompt from you. Hidden by default",
    hide: "Hide",
    show: "Show",
    shortcuts: "Keyboard shortcuts",
    shortcutPeriod: "Previous / next period",
    shortcutToday: "Move the period to today",
    shortcutView: "Month / week / day view",
    shortcutLayout: "Today / calendar / insights",
    shortcutTable: "Insights as a table",
    shortcutStep: "Open next / previous work block",
    shortcutSearch: "Search",
    shortcutClose: "Close details",
    shortcutMenu: "This menu",
    importing: (percent: number) => `Importing ${percent}%`,
    /** The button copying a work report; its menu picks the period. */
    standup: "Standup",
    standupTitle: "Copy a work report as Markdown, for a stand-up note or a weekly report",
    standupPeriods: "Period to copy",
    standupLastWorkday: "Last workday",
    standupWeek: "This week",
    /** No work in the weeks the last workday is looked for in. */
    standupNoWorkday: (days: number) => `None in ${days} days`,
    /** The page's own period, which the filters narrow. */
    standupShown: (u: Unit) => `The ${UNIT_EN[u]} on screen`,
    standupShownNote: "Filters apply",
    copiedReport: "Copied as Markdown",
    nothingToReport: "No work to copy",
  },
  ja: {
    prev: (u: Unit) => `前の${UNIT_JA[u]}`,
    next: (u: Unit) => `次の${UNIT_JA[u]}`,
    today: "今日",
    current: (u: Unit) => CURRENT_JA[u],
    viewToggle: "表示の切り替え",
    month: "月",
    week: "週",
    day: "日",
    viewTitle: "月・週・日の表示（m / w / d）",
    layoutToggle: "カレンダーとインサイトの切り替え",
    calendar: "カレンダー",
    summary: "インサイト",
    placeToggle: "Today と Journal の切り替え",
    journal: "Journal",
    home: "Today ページ",
    menu: "表示の設定とキーボード操作",
    menuTitle: "表示の設定とキーボード操作（?）",
    theme: "テーマ",
    themeSystem: "OS の設定に合わせる",
    themeLight: "ライト",
    themeDark: "ダーク",
    language: "言語",
    headlessRuns: "ヘッドレス実行",
    headlessRunsTitle:
      "claude -p や Agent SDK から始まり、あなたの発言がないセッション。初期状態では表示しません",
    hide: "非表示",
    show: "表示",
    shortcuts: "キーボード操作",
    shortcutPeriod: "前・次の期間",
    shortcutToday: "期間を今日に移動",
    shortcutView: "月・週・日の表示",
    shortcutLayout: "Today・カレンダー・インサイト",
    shortcutTable: "インサイトを表で見る",
    shortcutStep: "次・前の作業を開く",
    shortcutSearch: "検索",
    shortcutClose: "詳細を閉じる",
    shortcutMenu: "このメニュー",
    importing: (percent: number) => `取り込み中 ${percent}%`,
    standup: "レポート",
    standupTitle: "作業レポートを Markdown でコピー（日報・朝会・週報などに）",
    standupPeriods: "コピーする期間",
    standupLastWorkday: "前回の作業日",
    standupWeek: "今週",
    standupNoWorkday: (days: number) => `直近 ${days} 日はなし`,
    standupShown: (_u: Unit) => "表示中の期間",
    standupShownNote: "フィルタを適用",
    copiedReport: "Markdown でコピーしました",
    nothingToReport: "コピーする作業がありません",
  },
});

import { defineMessages } from "../index.ts";

/** A thread's page: the sessions behind one piece of work, and the way into it from the drawer. */
export const threadMessages = defineMessages({
  en: {
    /** The page's name, for the toolbar's screen-reader heading. */
    heading: "Thread",
    /** Above the thread's Goal. */
    goal: "Goal",
    /** In place of the Goal while none of the thread's blocks has a summary with one. */
    noGoal: "No summary says what this work was for yet",
    /** The thread's size and when it ran; `span` is a date range. */
    figures: (sessions: number, blocks: number, span: string) =>
      `${sessions === 1 ? "1 session" : `${sessions} sessions`} · ${
        blocks === 1 ? "1 block" : `${blocks} blocks`
      } · ${span}`,
    /** The days a thread ran, from the first to the last. */
    range: (from: string, to: string) => `${from} – ${to}`,
    sessions: "Sessions",
    /** The session the thread was opened from. */
    openedFrom: "opened here",
    /** How a session is tied to an earlier one in the thread. */
    tieContinued: "one conversation, continued",
    tiePr: (pr: string) => `same PR ${pr}`,
    tieBranch: (branch: string) => `same branch ${branch}`,
    tieItem: "an item one left open, the other closed",
    /** The thread hit its size limit. */
    truncated: (n: number) => `Showing the first ${n} sessions tied to this one`,
    /** The thread's blocks on one day, for screen readers. */
    dayWork: (date: string) => `The thread's work on ${date}`,
    stillOpen: (n: number) => `Still open (${n})`,
    settled: (n: number) => `Settled (${n})`,
    /** A row's link to the block that left the item open. */
    openedOn: (date: string) => `since ${date}`,
    /** The drawer's way into the thread; `n` is how many sessions it has. */
    open: (n: number) => `Thread · ${n} sessions`,
    openTitle: "Every session behind this work, in one page",
    /** The thread couldn't be loaded. */
    failed: (message: string) => `Couldn't load the thread: ${message}`,
    /** The session is hidden, or gone. */
    notFound: "This session isn't shown, so it has no thread to show",
  },
  ja: {
    heading: "スレッド",
    goal: "目的",
    noGoal: "この作業の目的を書いた要約はまだありません",
    figures: (sessions: number, blocks: number, span: string) =>
      `${sessions} セッション · ${blocks} ブロック · ${span}`,
    range: (from: string, to: string) => `${from}〜${to}`,
    sessions: "セッション",
    openedFrom: "ここから開いた",
    tieContinued: "引き継がれた会話",
    tiePr: (pr: string) => `同じ PR ${pr}`,
    tieBranch: (branch: string) => `同じブランチ ${branch}`,
    tieItem: "片方が残した未完了項目を、もう片方が閉じた",
    truncated: (n: number) => `このセッションにつながる最初の ${n} セッションを表示しています`,
    dayWork: (date: string) => `${date}のスレッドの作業`,
    stillOpen: (n: number) => `未完了（${n}）`,
    settled: (n: number) => `解決済み（${n}）`,
    openedOn: (date: string) => `${date}から`,
    open: (n: number) => `スレッド · ${n} セッション`,
    openTitle: "この作業を支えたセッションを1ページで",
    failed: (message: string) => `スレッドを読み込めませんでした: ${message}`,
    notFound: "このセッションは表示されていないため、スレッドはありません",
  },
});

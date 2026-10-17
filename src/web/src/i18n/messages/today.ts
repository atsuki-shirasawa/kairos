import { defineMessages } from "../index.ts";

/** How many open items a session left, in English. */
const openCount = (n: number) => (n === 1 ? "1 open item" : `${n} open items`);

/** The home page: what runs now and what the last workday was about. */
export const todayMessages = defineMessages({
  en: {
    /** The page's name, kept in English in both languages like "Live". */
    heading: "Today",
    now: "Now",
    /** An empty Working list. */
    nothingWorking: "Claude isn't working on anything",
    /** Only idle sessions are open: nothing waits on you or works. */
    onlyIdle: (idle: number) =>
      `Nothing is waiting on you or working (${idle === 1 ? "1 idle session" : `${idle} idle sessions`} on Live)`,
    openLive: "Open Live full screen",
    lastWorkday: "Last workday",
    /** How long ago the last workday was, after a break of more than a day. */
    sinceLastWork: (days: number) => `${days} days since the last work`,
    openDay: "Open the day",
    /** The last workday's work is all quick questions or headless runs, which this list leaves out. */
    nothingToList: "Only quick questions that day",
    /** Nothing to list in the weeks before today. */
    noWorkYet: (days: number) =>
      `No work in the ${days} days before today. If that's unexpected, run kairos doctor.`,
    /** A project's work on the day, for screen readers. */
    projectWork: (project: string) => `${project}'s work`,
    pickUp: "Pick up",
    /** No recent session left anything open that Pick up shows. */
    nothingToPickUp: "Nothing left open to pick up",
    /** Before the step a session's latest summary said was about to happen. */
    next: "Next",
    /** How many of a session's items wait on you. */
    waiting: (n: number) => `${n} waiting`,
    /** The toggle showing a session's open items. */
    openItems: (n: number) => openCount(n),
    /** The same toggle for screen readers, which name the session it belongs to. */
    openItemsOf: (n: number, headline: string) => `${openCount(n)}: ${headline}`,
    /** A session's open items, for screen readers. */
    itemsOf: (headline: string) => `Open items of ${headline}`,
    /** Shows the sessions the caps left out. */
    more: (n: number) => `${n} more`,
    fewer: "Show less",
  },
  ja: {
    heading: "Today",
    now: "いま",
    nothingWorking: "Claude が作業しているものはありません",
    onlyIdle: (idle: number) =>
      `あなたを待っているものも、作業中のものもありません（Live にアイドル ${idle} 件）`,
    openLive: "Live を全画面で開く",
    lastWorkday: "前回の作業日",
    sinceLastWork: (days: number) => `前回の作業から ${days} 日`,
    openDay: "その日を開く",
    nothingToList: "その日は短い質問だけでした",
    noWorkYet: (days: number) =>
      `今日より前の ${days} 日間に作業はありません。想定外なら kairos doctor を実行してください。`,
    projectWork: (project: string) => `${project} の作業`,
    pickUp: "Pick up",
    nothingToPickUp: "やり残したものはありません",
    next: "次の一手",
    waiting: (n: number) => `待ち ${n}`,
    openItems: (n: number) => `残課題 ${n}`,
    openItemsOf: (n: number, headline: string) => `残課題 ${n}（${headline}）`,
    itemsOf: (headline: string) => `${headline} の残課題`,
    more: (n: number) => `ほか ${n} 件`,
    fewer: "折りたたむ",
  },
});

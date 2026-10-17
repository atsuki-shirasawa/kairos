import { defineMessages } from "../index.ts";

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
  },
});

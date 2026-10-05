import { defineMessages } from "../index.ts";

/** Labels shared by the calendar, the list, and the formatting helpers. */
export const formatMessages = defineMessages({
  en: {
    toolErrors: (n: number) => `Tool errors ${n}`,
    interrupts: (n: number) => `Interrupts ${n}`,
    apiErrors: (n: number) => `API errors ${n}`,
    /** Joins short items in one line ("Commits 2 · PRs 1"). */
    separator: " · ",
    none: "None",
    unknownProject: "Unknown project",
    working: "In progress",
    /** The session's label (e.g. a worktree name) after the project name. */
    sessionLabel: (label: string) => ` (${label})`,
    blocks: (n: number) => (n === 1 ? "1 block" : `${n} blocks`),
    commitsPrs: (commits: number, prs: number) => `Commits ${commits} · PRs ${prs}`,
    trouble: (n: number) => `Snags ${n}`,
    copyFailed: "Couldn't copy to the clipboard",
  },
  ja: {
    toolErrors: (n: number) => `ツールのエラー ${n}`,
    interrupts: (n: number) => `中断 ${n}`,
    apiErrors: (n: number) => `API のエラー ${n}`,
    separator: "・",
    none: "なし",
    unknownProject: "プロジェクト不明",
    working: "作業中",
    sessionLabel: (label: string) => `（${label}）`,
    blocks: (n: number) => `${n} 件`,
    commitsPrs: (commits: number, prs: number) => `コミット ${commits}・PR ${prs}`,
    trouble: (n: number) => `つまずき ${n}`,
    copyFailed: "クリップボードにコピーできませんでした",
  },
});

/** Names of the project colors (Japanese mineral pigments). Keys match `PALETTE` in lib/colors.ts. */
export const paletteMessages = defineMessages({
  en: {
    p0: "Ultramarine",
    p1: "Verdigris",
    p2: "Ochre",
    p3: "Wisteria",
    p4: "Rose gray",
    p5: "Iron",
    p6: "Young bamboo",
    p7: "Red ochre",
  },
  ja: {
    p0: "群青",
    p1: "緑青",
    p2: "黄土",
    p3: "藤",
    p4: "桜鼠",
    p5: "鉄",
    p6: "若竹",
    p7: "弁柄",
  },
});

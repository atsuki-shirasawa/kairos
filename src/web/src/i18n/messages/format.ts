import type { OpenKind } from "@shared/summaryBody.ts";
import { defineMessages } from "../index.ts";

/**
 * An open item's kind as its tag on a row, in English in both languages, so the tags read the same
 * whatever the UI language. Kept apart from `openKind` (the tooltip's words), which is translated.
 */
const OPEN_KIND_TAGS = {
  todo: "To do",
  issue: "Issue",
  question: "Question",
  waiting: "Waiting",
} satisfies Record<OpenKind, string>;

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
    blocks: (n: number) => (n === 1 ? "1 work block" : `${n} work blocks`),
    commitsPrs: (commits: number, prs: number) => `Commits ${commits} · PRs ${prs}`,
    trouble: (n: number) => `Snags ${n}`,
    /** Snags with what kind they were, where there is no room for a tooltip of its own. */
    troubleWithDetail: (n: number, detail: string) => `Snags ${n} (${detail})`,
    copyFailed: "Couldn't copy to the clipboard",
    copyResume: "Copy the command to resume this session in Claude Code",
    copiedResume: "Copied. Paste it into a terminal to resume",
    /** What kind of thing an open item of a summary is, in a block's tooltip. */
    openKind: {
      todo: "To do",
      issue: "Issue",
      question: "Question",
      waiting: "Waiting",
    } satisfies Record<OpenKind, string>,
    /** An open item's kind as the tag before its text, in the lists of open items. */
    openKindTag: OPEN_KIND_TAGS,
    /** A block's open items in its tooltip, with their kinds. */
    openItems: (n: number, kinds: string) => `Open ${n}${kinds ? ` (${kinds})` : ""}`,
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
    troubleWithDetail: (n: number, detail: string) => `つまずき ${n}（${detail}）`,
    copyFailed: "クリップボードにコピーできませんでした",
    copyResume: "このセッションを Claude Code で再開するコマンドをコピー",
    copiedResume: "コピーしました。ターミナルに貼り付けると再開できます",
    openKind: {
      todo: "やること",
      issue: "問題",
      question: "未決",
      waiting: "待ち",
    } satisfies Record<OpenKind, string>,
    openKindTag: OPEN_KIND_TAGS,
    openItems: (n: number, kinds: string) => `残課題 ${n}${kinds ? `（${kinds}）` : ""}`,
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

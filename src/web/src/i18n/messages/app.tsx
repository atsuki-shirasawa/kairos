import type { ReactNode } from "react";
import type { View } from "@/lib/dates.ts";
import { defineMessages } from "../index.ts";
import { THIS_EN, THIS_JA } from "../period.ts";

type Period = View;

const periodEn = (p: Period) => THIS_EN[p];
const periodJa = (p: Period) => THIS_JA[p];

/** Notices over the calendar/list (connection errors, empty periods, filters with no match). */
export const appMessages = defineMessages({
  en: {
    disconnected: (command: ReactNode) => (
      <>Can't reach the Kairos server. Run {command} in a terminal to start it.</>
    ),
    noMatch: (p: Period) => `Nothing ${periodEn(p)} matches the filter.`,
    clearFilter: "Clear filter",
    ingesting: (percent: number) =>
      `Importing logs (${percent}%). Sessions will appear here when it finishes.`,
    hiddenByProject: (p: Period) =>
      `Everything ${periodEn(p)} belongs to hidden projects. Show them again from "Filter" at the top right.`,
    hiddenByBrief: (p: Period) =>
      `Everything ${periodEn(p)} is a hidden quick question or belongs to hidden projects. Show them again from "Filter" at the top right.`,
    noRecordsYet: "No sessions yet. Work in Claude Code and they will show up here within seconds.",
    noRecords: (p: Period) => `No sessions ${periodEn(p)}.`,
    previous: "Previous",
    next: "Next",
  },
  ja: {
    disconnected: (command: ReactNode) => (
      <>Kairos のサーバーに接続できません。ターミナルで {command} を実行すると起動します。</>
    ),
    noMatch: (p: Period) => `${periodJa(p)}に、絞り込みの条件に合う作業はありません。`,
    clearFilter: "条件を外す",
    ingesting: (percent: number) =>
      `ログを取り込んでいます（${percent}%）。終わると、ここに表示されます。`,
    hiddenByProject: (p: Period) =>
      `${periodJa(p)}の記録は、すべて非表示のプロジェクトのものです。右上の「絞り込み」から表示を戻せます。`,
    hiddenByBrief: (p: Period) =>
      `${periodJa(p)}の記録は、隠しているちょっとした質問か、非表示のプロジェクトのものです。右上の「絞り込み」から表示を戻せます。`,
    noRecordsYet: "まだ記録がありません。Claude Code で作業すると、数秒でここに表示されます。",
    noRecords: (p: Period) => `${periodJa(p)}の記録はありません。`,
    previous: "前の記録",
    next: "次の記録",
  },
});

import { defineMessages } from "../index.ts";

/** Copy for the calendar grid: day headers, block tooltips and off-screen hints. */
export const calendarMessages = defineMessages({
  en: {
    openDay: (date: string) => `Open ${date} in day view`,
    blocksWork: (blocks: string, busy: string) => `${blocks} · ${busy} of work`,
    claudeTotal: (ms: string) => ` (Claude ${ms} total)`,
    tokensCost: (tokens: string, cost: string) => `${tokens} tokens · ${cost} at API prices`,
    clickForDay: "Click for day view",
    /** Hint at the top/bottom edge for blocks scrolled out of view. */
    edgeAbove: (time: string, n: number) => `${n} until ${time}`,
    edgeBelow: (time: string, n: number) => `${n} from ${time}`,
    edgeAria: (above: boolean, text: string) =>
      `Jump to work ${above ? "above" : "below"} the view (${text})`,
    blockAria: (label: string, project: string, date: string, range: string) =>
      `${label}, ${project}, ${date} ${range}`,
    rangeDuration: (range: string, duration: string) => `${range} (${duration})`,
    notMatching: "Doesn't match the filter",
    notSummarized: "Not summarized yet, so the first prompt is shown as the heading",
  },
  ja: {
    openDay: (date: string) => `${date}を日表示で開く`,
    blocksWork: (blocks: string, busy: string) => `${blocks}・作業 ${busy}`,
    claudeTotal: (ms: string) => `（Claude 延べ ${ms}）`,
    tokensCost: (tokens: string, cost: string) => `${tokens} トークン・API 料金換算 ${cost}`,
    clickForDay: "クリックで日表示",
    edgeAbove: (time: string, n: number) => `${time} までに ${n} 件`,
    edgeBelow: (time: string, n: number) => `${time} から ${n} 件`,
    edgeAria: (above: boolean, text: string) =>
      `画面の${above ? "上" : "下"}にある作業へ移る（${text}）`,
    blockAria: (label: string, project: string, date: string, range: string) =>
      `${label}、${project}、${date} ${range}`,
    rangeDuration: (range: string, duration: string) => `${range}（${duration}）`,
    notMatching: "絞り込みの条件に合いません",
    notSummarized: "要約前のため、最初の発言を見出しにしています",
  },
});

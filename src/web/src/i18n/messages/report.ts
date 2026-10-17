import { isoDay } from "@shared/dates.ts";
import { ENGLISH_REPORT_LABELS, type ReportLabels, reportPeriod } from "@shared/report.ts";
import { weekday } from "@/lib/dates.ts";
import { defineMessages } from "../index.ts";

/**
 * The words of the copied report. English is the CLI's own (`ENGLISH_REPORT_LABELS`), so the
 * button and `kairos report` give the same text for the same range.
 */
export const reportMessages = defineMessages<ReportLabels>({
  en: ENGLISH_REPORT_LABELS,
  ja: {
    title: (first, last) => `作業レポート: ${reportPeriod(first, last)}`,
    day: (day) => `${isoDay(day)}（${weekday(day)}）`,
    summary: "まとめ",
    openItems: "残課題",
    noProject: "（プロジェクトなし）",
    noWork: "この期間に作業はありません。",
  },
});

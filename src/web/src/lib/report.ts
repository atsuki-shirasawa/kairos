// The work report the toolbar copies: which periods it offers, and the text in the UI language.
// Built and rendered by `shared/report.ts`, as `kairos report` is, so both give the same text.
import { startOfDay } from "@shared/dates.ts";
import { buildReport, type ReportInput, renderReport } from "@shared/report.ts";
import { reportMessages } from "@/i18n/messages/report.ts";
import { addDays, type Range, rangeOf } from "./dates.ts";

/** The periods the standup menu copies whatever the page shows. */
export const STANDUP_PERIODS = ["lastWorkday", "today", "week"] as const;

/** One of `STANDUP_PERIODS`: the last day with work before today, today, or this week. */
export type StandupPeriod = (typeof STANDUP_PERIODS)[number];

/**
 * The range a standup period covers at `now`. The last workday is found from the work itself
 * (`lastWorkday`); null while it isn't known or when there is none.
 */
export function standupRange(
  period: StandupPeriod,
  now: number,
  lastWorkday: number | null,
): Range | null {
  const today = startOfDay(now);
  switch (period) {
    case "lastWorkday":
      return lastWorkday === null ? null : { from: lastWorkday, to: addDays(lastWorkday, 1) };
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "week": {
      const { from, to } = rangeOf("week", today);
      return { from, to };
    }
  }
}

/** The report as the UI copies it, in the UI language; null when the period has no work. */
export function reportText(input: ReportInput): string | null {
  const report = buildReport(input);
  return report.days.length === 0 ? null : renderReport(report, { labels: reportMessages() });
}

import type { Project } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { spansQuery } from "@/hooks/queries.ts";
import { useReportText } from "@/hooks/useReportText.ts";
import { type ShownPeriod, type StandupPeriod, standupRange } from "@/lib/report.ts";
import { lastWorkday, workdaySearchRange } from "@/lib/today.ts";

/** The standup texts the toolbar's menu and the palette copy. */
export interface StandupReport {
  /** A fixed period's report; null when it has no work (or there was no last workday). */
  periodText: (period: StandupPeriod) => Promise<string | null>;
  /** The page's own period as shown, filters applied; null when it has no work. */
  shownText: (shown: ShownPeriod) => Promise<string | null>;
}

/**
 * Builds the standup report for a period, on demand. The last workday is looked up as part of the
 * copy (through the cache), so a copy asked for before it loaded waits for it rather than finding
 * nothing. Whether the projects are known (so hidden work stays out) is for the caller to check.
 */
export function useStandupReport(
  now: number,
  projects: ReadonlyMap<number, Project>,
): StandupReport {
  const client = useQueryClient();
  const build = useReportText(projects);
  const periodText = useCallback(
    async (period: StandupPeriod) => {
      const today = startOfDay(now);
      let workday: number | null = null;
      if (period === "lastWorkday") {
        const range = workdaySearchRange(today);
        const { spans } = await client.fetchQuery(spansQuery(range.from, range.to));
        workday = lastWorkday(spans, today, projects);
      }
      const range = standupRange(period, now, workday);
      return range ? build(range) : null;
    },
    [client, build, now, projects],
  );
  const shownText = useCallback(
    (shown: ShownPeriod) => build(shown, shown.sessions ?? undefined),
    [build],
  );
  return { periodText, shownText };
}

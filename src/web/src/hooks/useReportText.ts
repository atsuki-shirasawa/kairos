import type { CalendarSession, Project } from "@shared/api.ts";
import { reportOpenItemsRange } from "@shared/report.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { calendarQuery, openItemsQuery, recapsQuery } from "@/hooks/queries.ts";
import type { Range } from "@/lib/dates.ts";
import { reportText } from "@/lib/report.ts";

/** Builds the report text of a range, given its sessions when the page already holds them. */
export type BuildReport = (range: Range, sessions?: CalendarSession[]) => Promise<string | null>;

/**
 * Builds a range's report on demand: its sessions (unless the page passes the ones it shows,
 * filtered), recaps and the items open at its end, each through the query cache so a period
 * already on screen isn't fetched again. Null when the range has no work.
 */
export function useReportText(projects: ReadonlyMap<number, Project>): BuildReport {
  const client = useQueryClient();
  return useCallback(
    async ({ from, to }, shown) => {
      const openAt = reportOpenItemsRange(to);
      const [sessions, recaps, open] = await Promise.all([
        shown ?? client.fetchQuery(calendarQuery(from, to)).then((r) => r.sessions),
        client.fetchQuery(recapsQuery(from, to)),
        client.fetchQuery(openItemsQuery(openAt.from, openAt.to)),
      ]);
      return reportText({
        from,
        to,
        sessions,
        projects,
        recaps: recaps.recaps,
        openItems: open.items,
      });
    },
    [client, projects],
  );
}

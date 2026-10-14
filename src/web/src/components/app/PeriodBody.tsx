import { startOfDay } from "@shared/dates.ts";
import { CalendarGrid } from "@/components/CalendarGrid.tsx";
import { LivePage } from "@/components/LivePage.tsx";
import { MonthGrid } from "@/components/MonthGrid.tsx";
import { SessionList } from "@/components/SessionList.tsx";
import { SummaryTabs, SummaryView } from "@/components/SummaryView.tsx";
import type { LiveState } from "@/hooks/useLiveSummary.ts";
import type { PeriodData } from "@/hooks/usePeriodData.ts";
import type { UrlStateUpdate } from "@/hooks/useUrlState.ts";
import type { PeriodBodyProps } from "@/lib/periodBody.ts";
import type { UrlState } from "@/lib/urlState.ts";

/** What the main area shows for the layout: the live page, the table, the summary or a calendar. */
export function PeriodBody({
  state,
  update,
  data,
  live,
  now,
}: {
  state: UrlState;
  update: UrlStateUpdate;
  data: PeriodData;
  live: LiveState;
  now: number;
}) {
  if (state.layout === "live")
    return (
      <LivePage
        live={live.data}
        sessions={live.running}
        projects={data.projectMap}
        now={now}
        selectedId={state.session}
        // The anchor follows the block, so going back to the calendar shows its day
        onSelect={(session, at) => update({ anchor: startOfDay(at), session, at }, { push: true })}
      />
    );

  const body: PeriodBodyProps = {
    days: data.days,
    sessions: data.visible,
    projects: data.projectMap,
    selectedId: state.session,
    selectedAt: state.at,
    now,
    matches: data.matches,
    onSelect: (session, at) => update({ session, at }, { push: true }),
    onOpenDay: (day) => update({ view: "day", anchor: day }),
  };
  const summaryTabs = (
    <SummaryTabs
      table={state.layout === "list"}
      onTable={(table) => update({ layout: table ? "list" : "summary" })}
    />
  );

  if (state.layout === "list")
    return (
      <SessionList
        {...body}
        view={state.view}
        sort={state.sort}
        onSort={(sort) => update({ sort })}
        tabs={summaryTabs}
      />
    );
  if (state.layout === "summary")
    return (
      <SummaryView
        {...body}
        view={state.view}
        from={data.from}
        to={data.to}
        previous={data.previous}
        tabs={summaryTabs}
      />
    );
  return state.view === "month" ? <MonthGrid {...body} /> : <CalendarGrid {...body} />;
}

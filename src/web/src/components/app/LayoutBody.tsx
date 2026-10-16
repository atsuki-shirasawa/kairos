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
import type { Layout } from "@/lib/view.ts";

/** What every layout's body is given. */
export interface LayoutBodyProps {
  state: UrlState;
  update: UrlStateUpdate;
  data: PeriodData;
  live: LiveState;
  now: number;
}

/** The body each layout draws in the main area; what else sets a layout apart is in `lib/layouts.ts`. */
const BODIES: Record<Layout, (props: LayoutBodyProps) => React.ReactNode> = {
  calendar: CalendarBody,
  summary: SummaryBody,
  table: TableBody,
  live: LiveBody,
};

/** What the main area shows for the layout: a calendar, the summary, its table or the live page. */
export function LayoutBody(props: LayoutBodyProps) {
  const Body = BODIES[props.state.layout];
  return <Body {...props} />;
}

/** The week or day grid, or the month's. */
function CalendarBody(props: LayoutBodyProps) {
  const body = periodBodyProps(props);
  return props.state.view === "month" ? (
    <MonthGrid {...body} sessions={props.data.gridSessions} />
  ) : (
    <CalendarGrid {...body} />
  );
}

/** The summary's overview tab. */
function SummaryBody(props: LayoutBodyProps) {
  const { state, data } = props;
  return (
    <SummaryView
      {...periodBodyProps(props)}
      view={state.view}
      from={data.from}
      to={data.to}
      previous={data.previous}
      tabs={<SummaryLayoutTabs {...props} />}
    />
  );
}

/** The summary's table tab: one row per block. */
function TableBody(props: LayoutBodyProps) {
  const { state, update } = props;
  return (
    <SessionList
      {...periodBodyProps(props)}
      view={state.view}
      sort={state.sort}
      onSort={(sort) => update({ sort })}
      tabs={<SummaryLayoutTabs {...props} />}
    />
  );
}

/** The sessions running now. */
function LiveBody({ state, update, data, live, now }: LayoutBodyProps) {
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
}

/** The summary's overview / table tabs, each a layout of its own. */
function SummaryLayoutTabs({ state, update }: LayoutBodyProps) {
  return (
    <SummaryTabs
      table={state.layout === "table"}
      onTable={(table) => update({ layout: table ? "table" : "summary" })}
    />
  );
}

/** What every period body takes, from the shown period's data and the selection. */
function periodBodyProps({ state, update, data, now }: LayoutBodyProps): PeriodBodyProps {
  return {
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
}

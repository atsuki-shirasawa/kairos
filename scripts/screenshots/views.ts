// The pages the captures shoot, shared by the visual baseline (all of them) and the docs
// screenshots (a few, by name), so both open each page the same way.
import { DEMO_DAY, DEMO_WEEK, DRAWER_SESSION } from "./demo.ts";
import type { DemoServer, RegistryState } from "./demoServer.ts";
import { STATE_ORDER, STATES_SESSION, STRESS_DAY, type SummaryState } from "./stress.ts";

/** Section starts the shots' queries need, read from the server once it runs. */
export interface Starts {
  drawer: number;
  /** The states session's sections, by the summary state each shows. */
  states: Record<SummaryState, number>;
}

/** One view to shoot in every look. */
export interface View {
  name: string;
  query: (s: Starts) => string;
  registry: RegistryState;
}

/**
 * The views, in the order they are shot. The in-progress summary goes first: the server gives up on
 * the stand-in holding it after its summary timeout (3 minutes). The calendar views come before any
 * session runs, so the Live button's count stays out of them.
 */
export const VIEWS: View[] = [
  {
    name: "stress-failed",
    query: (s) => `?view=day&date=${STRESS_DAY}&session=${STATES_SESSION}&at=${s.states.failed}`,
    registry: "empty",
  },
  {
    name: "stress-pending",
    query: (s) => `?view=day&date=${STRESS_DAY}&session=${STATES_SESSION}&at=${s.states.pending}`,
    registry: "empty",
  },
  { name: "week", query: () => `?date=${DEMO_WEEK}`, registry: "empty" },
  {
    name: "drawer",
    query: (s) => `?date=${DEMO_WEEK}&session=${DRAWER_SESSION}&at=${s.drawer}`,
    registry: "empty",
  },
  { name: "day", query: () => `?view=day&date=${DEMO_DAY}`, registry: "empty" },
  { name: "month", query: () => `?view=month&date=${DEMO_WEEK}`, registry: "empty" },
  { name: "summary", query: () => `?layout=summary&date=${DEMO_WEEK}`, registry: "empty" },
  { name: "table", query: () => `?layout=list&date=${DEMO_WEEK}`, registry: "empty" },
  { name: "stress-day", query: () => `?view=day&date=${STRESS_DAY}`, registry: "empty" },
  { name: "stress-week", query: () => `?date=${STRESS_DAY}`, registry: "empty" },
  { name: "stress-month", query: () => `?view=month&date=${STRESS_DAY}`, registry: "empty" },
  { name: "today-running", query: () => "?", registry: "running" },
  { name: "today", query: () => "?", registry: "on-you" },
  { name: "today-none", query: () => "?", registry: "empty" },
  { name: "today-unreadable", query: () => "?", registry: "unreadable" },
];

/** The view called `name`; throws for a name no view has. */
export function viewNamed(name: string): View {
  const view = VIEWS.find((v) => v.name === name);
  if (!view) throw new Error(`no view named ${name}`);
  return view;
}

/** Reads the section starts the views' queries need from the running server. */
export async function readStarts(demo: DemoServer): Promise<Starts> {
  const [drawer] = await demo.sectionStarts(DRAWER_SESSION);
  const starts = await demo.sectionStarts(STATES_SESSION);
  if (drawer === undefined || starts.length !== STATE_ORDER.length)
    throw new Error("the demo sessions were not ingested as written");
  const states = Object.fromEntries(STATE_ORDER.map((state, i) => [state, starts[i]])) as Record<
    SummaryState,
    number
  >;
  return { drawer, states };
}

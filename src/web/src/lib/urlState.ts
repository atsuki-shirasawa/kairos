// The view state kept in the URL, as pure parse and serialize functions so the rules (defaults,
// left-out values, old links) can be tested without a browser. The hook only wires them to history.
import { parseIsoDay, startOfDay } from "@shared/dates.ts";
import {
  DAY_VIEW,
  journalPath,
  readSessionTarget,
  readUiPath,
  threadPath,
  UI_PARAMS,
  UI_PATHS,
  withQuery,
  writeSessionTarget,
} from "@shared/uiUrl.ts";
import { periodStart } from "./dates.ts";
import { type Filter, NO_FILTER } from "./filter.ts";
import { readFilter, writeFilter } from "./filterUrl.ts";
import { LAYOUTS, layoutOfTab, placeOf } from "./layouts.ts";
import { LEGACY_PARAMS, legacyLayout } from "./legacyUrl.ts";
import type { ListSort } from "./listTable.ts";
import type { Layout, View } from "./view.ts";

/**
 * Patches the view state and rewrites the URL. A move to another period or layout adds a history
 * entry on its own; `push: true` adds one for other steps too.
 */
export type UrlStateUpdate = (patch: Partial<UrlState>, opts?: { push?: boolean }) => void;

/** Time order; left out of the URL. */
export const DEFAULT_SORT: ListSort = { key: "start", desc: false };

/**
 * View state, synced with the URL so it survives reloads and the back button: Today at `/today`,
 * the Journal at `/journal/<day>` with `?view=&tab=&sort=&q=&in=&outcome=&state=&len=&branch=&brief=`,
 * a thread at `/thread/<session>`, and on any of them the open block (`session=&at=`).
 */
export interface UrlState {
  view: View;
  /** Whether the period is drawn as a calendar, listed, or summed up. */
  layout: Layout;
  /** The shown day (midnight). Week and month views show the week or month containing it. */
  anchor: number;
  session: string | null;
  /** Start of the selected section. null means the whole session. */
  at: number | null;
  sort: ListSort;
  filter: Filter;
  /** The session the shown thread was opened from; only meaningful on the thread layout. */
  thread: string | null;
}

/** Web-only parameter names; the ones the CLI also writes are in `UI_PARAMS`. */
const PARAMS = { tab: "tab", sort: "sort" } as const;

/** `-cost` is descending, `cost` ascending. */
function readSort(v: string | null): ListSort {
  const m = /^(-?)([a-z]+)$/.exec(v ?? "");
  if (!m?.[2] || m[2] === "start") return DEFAULT_SORT;
  return { key: m[2], desc: m[1] === "-" };
}

/** The period length; anything unknown is the week view. */
function readView(v: string | null): View {
  return v === "month" || v === DAY_VIEW ? v : "week";
}

/** What a page without a period holds besides its own: no period, sort or filter of its own. */
const PERIODLESS = { view: "week", sort: DEFAULT_SORT, filter: NO_FILTER, thread: null } as const;

/**
 * Today's state: the open block, and defaults for the rest. Today writes only the open block, so
 * it reads only that, and a period it couldn't keep through a reload isn't held.
 */
function todayState(q: URLSearchParams, today: number): UrlState {
  return { ...PERIODLESS, layout: "today", anchor: today, ...readSessionTarget(q) };
}

/** A thread's state: the session it was opened from and the open block, like Today otherwise. */
function threadState(q: URLSearchParams, today: number, thread: string): UrlState {
  return { ...PERIODLESS, layout: "thread", anchor: today, thread, ...readSessionTarget(q) };
}

/** What a URL says about a period and the open block, whichever page it is. */
function readCommon(q: URLSearchParams): Omit<UrlState, "layout" | "anchor"> {
  return {
    view: readView(q.get(UI_PARAMS.view)),
    ...readSessionTarget(q),
    sort: readSort(q.get(PARAMS.sort)),
    filter: readFilter(q),
    thread: null,
  };
}

/**
 * Reads the view state from a URL's path and query (`/journal/2026-10-01?view=day`). Today and
 * the Journal have paths; the root and any other path read the query as links from before the
 * paths did. A missing or invalid date means today (from `now`).
 */
export function parseUrlState(href: string, now: number): UrlState {
  const url = new URL(href, "http://kairos.invalid");
  const q = url.searchParams;
  const page = readUiPath(url.pathname);
  const today = startOfDay(now);
  if (page?.page === "today") return todayState(q, today);
  if (page?.page === "thread") return threadState(q, today, page.session);
  if (page?.page === "journal") {
    const anchor = parseIsoDay(page.date) ?? today;
    return { ...readCommon(q), layout: layoutOfTab(q.get(PARAMS.tab)), anchor };
  }
  const layout = legacyLayout(q);
  if (placeOf(layout) !== "journal") return todayState(q, today);
  const anchor = parseIsoDay(q.get(LEGACY_PARAMS.date)) ?? today;
  return { ...readCommon(q), layout, anchor };
}

/**
 * Writes the view state as a path and query, leaving out defaults (week view, the calendar tab,
 * today from `now`, time order, no filter). Today and a thread write only the open block: they
 * have no period. A thread without its session (which nothing opens) is written as Today.
 */
export function serializeUrlState(s: UrlState, now: number): string {
  const q = new URLSearchParams();
  if (placeOf(s.layout) !== "journal") {
    writeSessionTarget(s, q);
    const path = s.layout === "thread" && s.thread ? threadPath(s.thread) : UI_PATHS.today;
    return withQuery(path, q);
  }
  if (s.view !== "week") q.set(UI_PARAMS.view, s.view);
  const { tab } = LAYOUTS[s.layout];
  if (tab) q.set(PARAMS.tab, tab);
  writeSessionTarget(s, q);
  if (s.sort.key !== "start") q.set(PARAMS.sort, `${s.sort.desc ? "-" : ""}${s.sort.key}`);
  writeFilter(s.filter, q);
  const day = startOfDay(s.anchor) === startOfDay(now) ? null : s.anchor;
  return withQuery(journalPath(day), q);
}

/**
 * The URL change that opens `day` in the Journal's day page from a page without a period (Today):
 * the day as the period, and nothing open, so the page opens its own first block.
 */
export function openDayPage(day: number): Partial<UrlState> {
  return { layout: "calendar", view: "day", anchor: day, session: null, at: null };
}

/** The URL change that opens the thread of a session, with nothing open over it. */
export function openThread(session: string): Partial<UrlState> {
  return { layout: "thread", thread: session, session: null, at: null };
}

/**
 * Whether going from `prev` to `next` starts a history entry the back button should return to: a
 * different period (view, or a step to another week, month or day), a different layout or another
 * thread.
 * Selecting a block, filtering and sorting replace the current entry.
 */
export function startsNewEntry(prev: UrlState, next: UrlState): boolean {
  return (
    prev.layout !== next.layout ||
    (next.layout === "thread" && prev.thread !== next.thread) ||
    prev.view !== next.view ||
    periodStart(prev.view, prev.anchor) !== periodStart(next.view, next.anchor)
  );
}

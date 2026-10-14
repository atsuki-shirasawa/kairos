// The view state kept in the URL, as pure parse and serialize functions so the rules (defaults,
// left-out values) can be tested without a browser. The hook only wires them to history.
import { isoDay, startOfDay } from "@shared/dates.ts";
import { DAY_VIEW, readSessionTarget, UI_PARAMS, writeSessionTarget } from "@shared/uiUrl.ts";
import { fromISODate, type Layout, type View } from "./dates.ts";
import { type Filter, readFilter, writeFilter } from "./filter.ts";
import type { ListSort } from "./listTable.ts";

/** Time order; left out of the URL. */
export const DEFAULT_SORT: ListSort = { key: "start", desc: false };

/** View state. Synced with the URL (?view=&layout=&date=&session=&sort=&q=&in=&outcome=&state=&len=&branch=&brief=), so it survives reloads and the back button. */
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
}

/** Web-only parameter names; the ones the CLI also writes are in `UI_PARAMS`. */
const PARAMS = { layout: "layout", sort: "sort" } as const;

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

/** How the period is drawn; anything unknown is the calendar. */
function readLayout(v: string | null): Layout {
  return v === "list" || v === "summary" || v === "live" ? v : "calendar";
}

/** Reads the view state from URL parameters. A missing or invalid date means today (from `now`). */
export function parseUrlState(q: URLSearchParams, now: number): UrlState {
  return {
    view: readView(q.get(UI_PARAMS.view)),
    layout: readLayout(q.get(PARAMS.layout)),
    anchor: fromISODate(q.get(UI_PARAMS.date)) ?? startOfDay(now),
    ...readSessionTarget(q),
    sort: readSort(q.get(PARAMS.sort)),
    filter: readFilter(q),
  };
}

/**
 * Writes the view state as URL parameters, leaving out defaults (week view, calendar, today from
 * `now`, time order, no filter).
 */
export function serializeUrlState(s: UrlState, now: number): URLSearchParams {
  const q = new URLSearchParams();
  if (s.view !== "week") q.set(UI_PARAMS.view, s.view);
  if (s.layout !== "calendar") q.set(PARAMS.layout, s.layout);
  if (startOfDay(s.anchor) !== startOfDay(now)) q.set(UI_PARAMS.date, isoDay(s.anchor));
  writeSessionTarget(s, q);
  if (s.sort.key !== "start") q.set(PARAMS.sort, `${s.sort.desc ? "-" : ""}${s.sort.key}`);
  writeFilter(s.filter, q);
  return q;
}

import { useCallback, useEffect, useState } from "react";
import { fromISODate, type Layout, startOfDay, toISODate, type View } from "@/lib/dates.ts";
import { type Filter, NO_FILTER } from "@/lib/filter.ts";

/** List sort. `start` is time order (grouped by day); the others are column keys. */
export interface ListSort {
  key: string;
  desc: boolean;
}

/** Time order; left out of the URL. */
export const DEFAULT_SORT: ListSort = { key: "start", desc: false };

/** View state. Synced with the URL (?view=&layout=&date=&session=&sort=&q=&outcome=&brief=), so it survives reloads and the back button. */
export interface UrlState {
  view: View;
  /** Whether the period is drawn as a calendar, listed, or summed up. */
  layout: Layout;
  /** The shown day (midnight). Week view shows the week containing it. */
  anchor: number;
  session: string | null;
  /** Start of the selected section. null means the whole session. */
  at: number | null;
  sort: ListSort;
  filter: Filter;
}

/** `-cost` is descending, `cost` ascending. */
function readSort(v: string | null): ListSort {
  const m = /^(-?)([a-z]+)$/.exec(v ?? "");
  if (!m?.[2] || m[2] === "start") return DEFAULT_SORT;
  return { key: m[2], desc: m[1] === "-" };
}

function read(): UrlState {
  const q = new URLSearchParams(location.search);
  const view = q.get("view") === "day" ? "day" : "week";
  const layout = q.get("layout");
  return {
    view,
    layout: layout === "list" || layout === "summary" ? layout : "calendar",
    anchor: fromISODate(q.get("date")) ?? startOfDay(Date.now()),
    session: q.get("session"),
    at: Number(q.get("at")) || null,
    sort: readSort(q.get("sort")),
    filter: {
      q: q.get("q") ?? NO_FILTER.q,
      outcome: q.get("outcome") === "1",
      hideBrief: q.get("brief") === "hide",
    },
  };
}

function write(s: UrlState, push: boolean): void {
  const q = new URLSearchParams();
  if (s.view !== "week") q.set("view", s.view);
  if (s.layout !== "calendar") q.set("layout", s.layout);
  if (startOfDay(s.anchor) !== startOfDay(Date.now())) q.set("date", toISODate(s.anchor));
  if (s.session) q.set("session", s.session);
  if (s.session && s.at) q.set("at", String(s.at));
  if (s.sort.key !== "start") q.set("sort", `${s.sort.desc ? "-" : ""}${s.sort.key}`);
  if (s.filter.q) q.set("q", s.filter.q);
  if (s.filter.outcome) q.set("outcome", "1");
  if (s.filter.hideBrief) q.set("brief", "hide");
  const url = `${location.pathname}${q.size ? `?${q}` : ""}`;
  if (url === `${location.pathname}${location.search}`) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

/**
 * The view state and a patch function that also rewrites the URL.
 * Pass `push: true` for steps the back button should undo (opening a block, a search hit).
 */
export function useUrlState(): [
  UrlState,
  (patch: Partial<UrlState>, opts?: { push?: boolean }) => void,
] {
  const [state, setState] = useState(read);

  useEffect(() => {
    const onPop = () => setState(read());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<UrlState>, opts: { push?: boolean } = {}) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      write(next, opts.push ?? false);
      return next;
    });
  }, []);

  return [state, update];
}

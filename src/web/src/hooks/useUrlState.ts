import { useCallback, useEffect, useState } from "react";
import { fromISODate, type Layout, startOfDay, toISODate, type View } from "@/lib/dates.ts";
import { type Filter, NO_FILTER } from "@/lib/filter.ts";

/** リストの並べ替え。`start` は時刻順（日ごとにまとめる）、ほかは列のキー。 */
export interface ListSort {
  key: string;
  desc: boolean;
}

export const DEFAULT_SORT: ListSort = { key: "start", desc: false };

/** 表示状態。URL（?view=&layout=&date=&session=&sort=&q=&outcome=&brief=）と同期し、リロードや戻るボタンでも保たれる。 */
export interface UrlState {
  view: View;
  /** 期間の中身をカレンダーで描くか、リストで並べるか。 */
  layout: Layout;
  /** 表示中の日（0 時）。週表示ではその日を含む週を表示する。 */
  anchor: number;
  session: string | null;
  /** 選んだセクションの開始時刻。null ならセッション全体。 */
  at: number | null;
  sort: ListSort;
  filter: Filter;
}

/** `-cost` は大きい順、`cost` は小さい順。 */
function readSort(v: string | null): ListSort {
  const m = /^(-?)([a-z]+)$/.exec(v ?? "");
  if (!m?.[2] || m[2] === "start") return DEFAULT_SORT;
  return { key: m[2], desc: m[1] === "-" };
}

function read(): UrlState {
  const q = new URLSearchParams(location.search);
  const view = q.get("view") === "day" ? "day" : "week";
  return {
    view,
    layout: q.get("layout") === "list" ? "list" : "calendar",
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

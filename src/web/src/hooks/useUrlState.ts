import { useCallback, useEffect, useState } from "react";
import { fromISODate, startOfDay, toISODate, type View } from "@/lib/dates.ts";

/** 表示状態。URL（?view=&date=&session=）と同期し、リロードや戻るボタンでも保たれる。 */
export interface UrlState {
  view: View;
  /** 表示中の日（0 時）。週表示ではその日を含む週を表示する。 */
  anchor: number;
  session: string | null;
  /** 選んだセクションの開始時刻。null ならセッション全体。 */
  at: number | null;
}

function read(): UrlState {
  const q = new URLSearchParams(location.search);
  const view = q.get("view") === "day" ? "day" : "week";
  return {
    view,
    anchor: fromISODate(q.get("date")) ?? startOfDay(Date.now()),
    session: q.get("session"),
    at: Number(q.get("at")) || null,
  };
}

function write(s: UrlState, push: boolean): void {
  const q = new URLSearchParams();
  if (s.view !== "week") q.set("view", s.view);
  if (startOfDay(s.anchor) !== startOfDay(Date.now())) q.set("date", toISODate(s.anchor));
  if (s.session) q.set("session", s.session);
  if (s.session && s.at) q.set("at", String(s.at));
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

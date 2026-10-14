import { useCallback, useEffect, useRef, useState } from "react";
import { parseUrlState, serializeUrlState, type UrlState } from "@/lib/urlState.ts";

/** The view state of the current location. */
function readLocation(): UrlState {
  return parseUrlState(new URLSearchParams(location.search), Date.now());
}

/** Rewrites the URL for the state; does nothing when it is already there, so no duplicate entry. */
function writeLocation(s: UrlState, push: boolean): void {
  const q = serializeUrlState(s, Date.now());
  const url = `${location.pathname}${q.size ? `?${q}` : ""}`;
  if (url === `${location.pathname}${location.search}`) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

/** Patches the view state and rewrites the URL. `push: true` adds a history entry. */
export type UrlStateUpdate = (patch: Partial<UrlState>, opts?: { push?: boolean }) => void;

/**
 * The view state and a patch function that also rewrites the URL.
 * Pass `push: true` for steps the back button should undo (opening a block, a search hit).
 */
export function useUrlState(): [UrlState, UrlStateUpdate] {
  const [state, setState] = useState(readLocation);
  // The latest state, including patches not rendered yet, so successive patches in one event build
  // on each other. The URL write needs it outside a setState updater, which React may run twice.
  const latest = useRef(state);

  useEffect(() => {
    const onPop = () => {
      latest.current = readLocation();
      setState(latest.current);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<UrlState>, opts: { push?: boolean } = {}) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    writeLocation(next, opts.push ?? false);
    setState(next);
  }, []);

  return [state, update];
}

import { useCallback, useEffect, useRef, useState } from "react";
import { parseUrlState, serializeUrlState, startsNewEntry, type UrlState } from "@/lib/urlState.ts";

/** The current location's path and query. */
const here = () => `${location.pathname}${location.search}`;

/** The view state of the current location. */
function readLocation(): UrlState {
  return parseUrlState(here(), Date.now());
}

/** Rewrites the URL for the state; does nothing when it is already there, so no duplicate entry. */
function writeLocation(s: UrlState, push: boolean): void {
  const url = serializeUrlState(s, Date.now());
  if (url === here()) return;
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
}

/**
 * Patches the view state and rewrites the URL. A move to another period or layout adds a history
 * entry on its own; `push: true` adds one for other steps too.
 */
export type UrlStateUpdate = (patch: Partial<UrlState>, opts?: { push?: boolean }) => void;

/**
 * The view state and a patch function that also rewrites the URL.
 * Moving to another period or layout adds a history entry, so the back button returns to where
 * you were. Pass `push: true` for other steps it should undo (opening a block, a search hit).
 */
export function useUrlState(): [UrlState, UrlStateUpdate] {
  const [state, setState] = useState(readLocation);
  // The latest state, including patches not rendered yet, so successive patches in one event build
  // on each other. The URL write needs it outside a setState updater, which React may run twice.
  const latest = useRef(state);

  // An old link, the root or a URL with values it drops reads as its canonical path
  useEffect(() => writeLocation(latest.current, false), []);

  useEffect(() => {
    const onPop = () => {
      latest.current = readLocation();
      setState(latest.current);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<UrlState>, opts: { push?: boolean } = {}) => {
    const prev = latest.current;
    const next = { ...prev, ...patch };
    latest.current = next;
    writeLocation(next, opts.push ?? startsNewEntry(prev, next));
    setState(next);
  }, []);

  return [state, update];
}

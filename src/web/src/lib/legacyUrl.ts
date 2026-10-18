// Links from before the UI had paths: everything in the query of `/`, the layout named by
// `layout` and the day by `date`. The CLI wrote such links into terminals and notes, so they keep
// opening what they did; the app then rewrites the URL to its path.
import { UI_PARAMS } from "@shared/uiUrl.ts";
import type { Layout } from "./view.ts";

/** The query parameters only old links carry. */
export const LEGACY_PARAMS = { layout: "layout", date: "date" } as const;

/**
 * Every value the `layout` parameter took, and the layout it opens now. The table was once a
 * layout of its own called the list, and the live page went into Today's Now.
 */
const LEGACY_LAYOUTS: ReadonlyMap<string, Layout> = new Map([
  ["calendar", "calendar"],
  ["summary", "summary"],
  ["list", "table"],
  ["live", "today"],
]);

/** Parameters that say nothing about a period: the open block, which any page can show. */
const PERIODLESS_PARAMS: ReadonlySet<string> = new Set([UI_PARAMS.session, UI_PARAMS.at]);

/**
 * Whether an old URL carries state only a period shows (its date, view, sort, search or filters).
 * One without a layout then comes from before the home page, and opens the calendar as it did.
 */
function namesPeriodState(q: URLSearchParams): boolean {
  return [...q.keys()].some((k) => k !== LEGACY_PARAMS.layout && !PERIODLESS_PARAMS.has(k));
}

/**
 * The layout an old URL opens: the one its `layout` names, else the calendar when it carries a
 * period's state (links from before the home page, and the CLI's day links), else Today.
 */
export function legacyLayout(q: URLSearchParams): Layout {
  const named = LEGACY_LAYOUTS.get(q.get(LEGACY_PARAMS.layout) ?? "");
  return named ?? (namesPeriodState(q) ? "calendar" : "today");
}

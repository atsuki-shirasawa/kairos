// Every layout of the main area and what sets each apart, in one place: the toolbar, the keys, the
// drawer, the URL and the data the app fetches all read it here instead of checking layout names.
// The body each layout draws is mapped in components/app/LayoutBody.tsx.
import { todayMessages } from "@/i18n/messages/today.ts";
import type { Shortcut } from "./shortcuts.ts";
import type { Layout, View } from "./view.ts";

/** Which of the drawer's stepping controls a layout offers. */
export interface DrawerStepping {
  /** Previous / next block. They walk the period's blocks, which a periodless layout doesn't show. */
  blocks: boolean;
  /** The burst of headless runs. Only the calendar draws a burst as one mark; the table and summary give each run a row. */
  runs: boolean;
}

/** What sets a layout apart. */
export interface LayoutTraits {
  /** Its value of the URL's `layout` parameter; null for the default, left out of the URL. */
  param: string | null;
  /** The key that switches to it. */
  shortcut: Shortcut;
  /**
   * Whether it shows a period. Without one, the period's controls (moving, picking, search,
   * filters, the report) give way and its data isn't fetched.
   */
  hasPeriod: boolean;
  /**
   * The layout whose toolbar control is lit while it shows: its own (a segment of the layout
   * toggle, or the Live button for Today), or the one it is a tab of.
   */
  lit: Layout;
  /**
   * Whether the drawer floats over it instead of taking a column beside it, for a period length.
   * Seven-column views and Today's two columns would shrink to slivers beside it.
   */
  drawerOverlay: (view: View) => boolean;
  /**
   * The heading the toolbar shows in place of the period controls, for a layout without a period;
   * null for one with a period, whose date picker heads the page.
   */
  heading: (() => string) | null;
  stepping: DrawerStepping;
  /** The summary compares with the period before. */
  comparesPrevious: boolean;
  /** The month calendar pads its weeks with the adjacent months' days, and draws their work. */
  padsMonth: boolean;
}

/** The layouts, in the order the layout toggle lists the ones that have a segment. */
export const LAYOUTS: Readonly<Record<Layout, LayoutTraits>> = {
  today: {
    param: null,
    shortcut: "home",
    hasPeriod: false,
    lit: "today",
    // Its two columns would shrink to slivers beside the drawer
    drawerOverlay: () => true,
    heading: () => todayMessages().heading,
    stepping: { blocks: false, runs: false },
    comparesPrevious: false,
    padsMonth: false,
  },
  calendar: {
    param: "calendar",
    shortcut: "calendar",
    hasPeriod: true,
    lit: "calendar",
    // The day view's single column has room to spare
    drawerOverlay: (view) => view !== "day",
    heading: null,
    stepping: { blocks: true, runs: true },
    comparesPrevious: false,
    padsMonth: true,
  },
  summary: {
    param: "summary",
    shortcut: "summary",
    hasPeriod: true,
    lit: "summary",
    drawerOverlay: () => false,
    heading: null,
    stepping: { blocks: true, runs: false },
    comparesPrevious: true,
    padsMonth: false,
  },
  table: {
    // The table was once a layout of its own called the list; old links keep working
    param: "list",
    shortcut: "table",
    hasPeriod: true,
    // A tab of the summary, so it lights the summary's segment
    lit: "summary",
    drawerOverlay: () => false,
    heading: null,
    stepping: { blocks: true, runs: false },
    comparesPrevious: false,
    padsMonth: false,
  },
};

/**
 * The layout shown when the URL names none: what is running and what was done last, which is what
 * Kairos is opened for most.
 */
export const DEFAULT_LAYOUT: Layout = "today";

/**
 * The layout a URL naming none but carrying a period's state (its date, view, search or filters)
 * shows. Links written before the home page, and the CLI's day links, open the calendar.
 */
const PERIOD_LAYOUT: Layout = "calendar";

const ENTRIES = Object.entries(LAYOUTS) as [Layout, LayoutTraits][];

/** Every layout, in the registry's order. */
export const LAYOUT_IDS: readonly Layout[] = ENTRIES.map(([id]) => id);

/**
 * Layouts that are gone, by their old `layout` value, and the one an old link opens instead. The
 * live page went into Today's Now.
 */
const RETIRED_PARAMS: ReadonlyMap<string, Layout> = new Map([["live", "today"]]);

/**
 * The layout a URL's `layout` parameter names. Anything unknown, or none, is the default, unless
 * the URL carries a period's state, which only the calendar can show then.
 */
export function layoutOfParam(
  param: string | null,
  { carriesPeriod = false }: { carriesPeriod?: boolean } = {},
): Layout {
  const named = ENTRIES.find(([, t]) => t.param !== null && t.param === param)?.[0];
  const retired = param === null ? undefined : RETIRED_PARAMS.get(param);
  return named ?? retired ?? (carriesPeriod ? PERIOD_LAYOUT : DEFAULT_LAYOUT);
}

/** The layout a shortcut switches to, or null for a shortcut that isn't a layout's. */
export function layoutOfShortcut(shortcut: Shortcut): Layout | null {
  return ENTRIES.find(([, t]) => t.shortcut === shortcut)?.[0] ?? null;
}

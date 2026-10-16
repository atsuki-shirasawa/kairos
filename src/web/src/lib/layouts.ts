// Every layout of the main area and what sets each apart, in one place: the toolbar, the keys, the
// drawer, the URL and the data the app fetches all read it here instead of checking layout names.
// The body each layout draws is mapped in components/app/LayoutBody.tsx.
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
   * toggle, or the Live button), or the one it is a tab of.
   */
  lit: Layout;
  /**
   * Whether the drawer floats over it instead of taking a column beside it, for a period length.
   * Seven-column views and the live page's three columns would shrink to slivers beside it.
   */
  drawerOverlay: (view: View) => boolean;
  stepping: DrawerStepping;
  /** The summary compares with the period before. */
  comparesPrevious: boolean;
  /** The month calendar pads its weeks with the adjacent months' days, and draws their work. */
  padsMonth: boolean;
}

/** The layouts, in the order the layout toggle lists the ones that have a segment. */
export const LAYOUTS: Readonly<Record<Layout, LayoutTraits>> = {
  calendar: {
    param: null,
    shortcut: "calendar",
    hasPeriod: true,
    lit: "calendar",
    // The day view's single column has room to spare
    drawerOverlay: (view) => view !== "day",
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
    stepping: { blocks: true, runs: false },
    comparesPrevious: false,
    padsMonth: false,
  },
  live: {
    param: "live",
    shortcut: "live",
    hasPeriod: false,
    lit: "live",
    drawerOverlay: () => true,
    stepping: { blocks: false, runs: false },
    comparesPrevious: false,
    padsMonth: false,
  },
};

/** The layout shown when the URL names none. */
export const DEFAULT_LAYOUT: Layout = "calendar";

const ENTRIES = Object.entries(LAYOUTS) as [Layout, LayoutTraits][];

/** Every layout, in the registry's order. */
export const LAYOUT_IDS: readonly Layout[] = ENTRIES.map(([id]) => id);

/** The layout a URL's `layout` parameter names; anything unknown is the default. */
export function layoutOfParam(param: string | null): Layout {
  return ENTRIES.find(([, t]) => t.param !== null && t.param === param)?.[0] ?? DEFAULT_LAYOUT;
}

/** The layout a shortcut switches to, or null for a shortcut that isn't a layout's. */
export function layoutOfShortcut(shortcut: Shortcut): Layout | null {
  return ENTRIES.find(([, t]) => t.shortcut === shortcut)?.[0] ?? null;
}

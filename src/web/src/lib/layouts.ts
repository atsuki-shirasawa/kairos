// Every layout of the main area and what sets each apart, in one place: the toolbar, the keys, the
// drawer, the URL and the data the app fetches all read it here instead of checking layout names.
// The body each layout draws is mapped in components/app/LayoutBody.tsx.

import type { UiPlace } from "@shared/uiUrl.ts";
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
  /**
   * Its value of the Journal's `tab` parameter; null for the Journal's default tab and for Today,
   * which has a path of its own.
   */
  tab: string | null;
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
    tab: null,
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
    tab: null,
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
    tab: "insights",
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
    tab: "table",
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

const ENTRIES = Object.entries(LAYOUTS) as [Layout, LayoutTraits][];

/** Every layout, in the registry's order. */
export const LAYOUT_IDS: readonly Layout[] = ENTRIES.map(([id]) => id);

/**
 * The UI's two places: Today, and the Journal, which holds every layout that shows a period (the
 * calendar, and Insights with its table).
 */
export type Place = UiPlace;

/** The place a layout belongs to. */
export function placeOf(layout: Layout): Place {
  return LAYOUTS[layout].hasPeriod ? "journal" : "today";
}

/** The layout going to a place opens: Today, or the Journal's tab (its default unless given). */
export function layoutOfPlace(place: Place, journalTab: Layout = JOURNAL_DEFAULT): Layout {
  return place === "today" ? "today" : journalTab;
}

/** The Journal's layout when its URL names no tab, or one it doesn't know. */
export const JOURNAL_DEFAULT: Layout = "calendar";

/** The Journal's layout a `tab` value names; none, or anything unknown, is the calendar. */
export function layoutOfTab(tab: string | null): Layout {
  const named = ENTRIES.find(([, t]) => t.hasPeriod && t.tab !== null && t.tab === tab)?.[0];
  return named ?? JOURNAL_DEFAULT;
}

/** The layout a shortcut switches to, or null for a shortcut that isn't a layout's. */
export function layoutOfShortcut(shortcut: Shortcut): Layout | null {
  return ENTRIES.find(([, t]) => t.shortcut === shortcut)?.[0] ?? null;
}

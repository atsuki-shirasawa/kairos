// How the session drawer sits beside each layout: floating over it or taking its own column, and
// which ways of stepping between blocks it offers there.
import type { Layout, View } from "./view.ts";

/**
 * Whether the drawer floats over the body instead of taking a column beside it. The day view's
 * single column has room to spare, so only the seven-column views float it; the live page's
 * three columns would shrink to slivers beside it.
 */
export function drawerOverlay(layout: Layout, view: View): boolean {
  return (layout === "calendar" && view !== "day") || layout === "live";
}

/** Which of the drawer's stepping controls a layout offers. */
export interface DrawerStepping {
  /** Previous / next block. They walk the period's blocks, which the live page doesn't show. */
  blocks: boolean;
  /** The burst of headless runs. Only the calendar draws a burst as one mark; the list and table give each run a row. */
  runs: boolean;
}

/** The drawer's stepping controls for a layout. */
export function drawerStepping(layout: Layout): DrawerStepping {
  return { blocks: layout !== "live", runs: layout === "calendar" };
}

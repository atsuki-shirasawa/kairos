/** Segmented toggle look: only the selected item rises off the track (iOS / macOS style). */
export const SEGMENTED = "rounded-lg bg-muted p-0.5";
/** Class for an item inside a `SEGMENTED` track; the selected item (`data-state=on`) lifts out. */
export const SEGMENT =
  "h-7 rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

import { defineMessages } from "../index.ts";

/** The Journal's day page: the list of the day's work beside the selected block's detail. */
export const journalMessages = defineMessages({
  en: {
    /** The list, for screen readers; `date` is the shown day. */
    dayWork: (date: string) => `Work on ${date}`,
    /** A stretch with no work between two blocks; `duration` is "1h 20m". */
    quiet: (duration: string) => `${duration} with no work`,
    /** The day's first Resolved points, for screen readers. */
    resolved: "Resolved",
  },
  ja: {
    dayWork: (date: string) => `${date}の作業`,
    quiet: (duration: string) => `${duration} 作業なし`,
    resolved: "解決",
  },
});

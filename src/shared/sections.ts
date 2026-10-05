// Rules for summarizing sections (work blocks). Shared by the server and the web app.

/** Only sections at least this long, or with at least this many prompts, are summarized by the LLM. */
export const SUMMARY_MIN_DURATION_MS = 10 * 60_000;
/** See `SUMMARY_MIN_DURATION_MS`. */
export const SUMMARY_MIN_PROMPTS = 2;
/** A section counts as finished, and gets summarized, once this long has passed since its last activity. */
export const SECTION_IDLE_MS = 30 * 60_000;
/** Only sections that finished within this many days are summarized automatically; older ones are done when opened. */
export const AUTO_SUMMARY_DAYS = 7;

/** Whether a section has enough in it for an LLM body; shorter ones get only a headline. */
export function isSummarizable(section: {
  start: number;
  end: number;
  promptCount: number;
}): boolean {
  return (
    section.end - section.start >= SUMMARY_MIN_DURATION_MS ||
    section.promptCount >= SUMMARY_MIN_PROMPTS
  );
}

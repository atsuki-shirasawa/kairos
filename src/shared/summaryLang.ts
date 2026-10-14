// The languages summaries are written in. Shared because the API's settings carry it and the
// server validates and stores it.

/** Language the summaries are written in. Follows the UI language unless `--summary-lang` fixes it. */
export type SummaryLang = "en" | "ja";

/** Summary language when neither `--summary-lang` nor the UI has chosen one. */
export const DEFAULT_SUMMARY_LANG: SummaryLang = "en";

/** Whether the value is a supported summary language (validates API input and stored settings). */
export function isSummaryLang(v: unknown): v is SummaryLang {
  return v === "en" || v === "ja";
}

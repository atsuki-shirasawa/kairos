// Settings kept in the DB's kv table, so they survive restarts from the SessionStart hook
// (which starts the server without options).
import type { Database } from "bun:sqlite";
import { isSummaryLang, type SummaryLang } from "./summarize/prompt.ts";

const SUMMARY_LANG = "summary_lang";

/** The language chosen in the UI for summaries, or null if it was never set. */
export function storedSummaryLang(db: Database): SummaryLang | null {
  const v = db
    .query<{ value: string }, [string]>("SELECT value FROM kv WHERE key = ?")
    .get(SUMMARY_LANG)?.value;
  return isSummaryLang(v) ? v : null;
}

export function storeSummaryLang(db: Database, lang: SummaryLang): void {
  db.query(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(SUMMARY_LANG, lang);
}

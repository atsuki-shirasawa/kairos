// Settings kept in the DB's kv table, so they survive restarts from the SessionStart hook
// (which starts the server without options).
import type { Database } from "bun:sqlite";
import { isSummaryLang, type SummaryLang } from "../shared/summaryLang.ts";

const SUMMARY_LANG = "summary_lang";
const SHOW_HEADLESS = "show_headless";

function readKv(db: Database, key: string): string | undefined {
  return db.query<{ value: string }, [string]>("SELECT value FROM kv WHERE key = ?").get(key)
    ?.value;
}

function writeKv(db: Database, key: string, value: string): void {
  db.query(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/** The language chosen in the UI for summaries, or null if it was never set. */
export function storedSummaryLang(db: Database): SummaryLang | null {
  const v = readKv(db, SUMMARY_LANG);
  return isSummaryLang(v) ? v : null;
}

/** Saves the UI's summary language so it outlives restarts. */
export function storeSummaryLang(db: Database, lang: SummaryLang): void {
  writeKv(db, SUMMARY_LANG, lang);
}

/** Whether the calendar also shows headless sessions (automatic runs). Off until turned on. */
export function storedShowHeadless(db: Database): boolean {
  return readKv(db, SHOW_HEADLESS) === "1";
}

/** Saves whether headless sessions are shown. A server setting, so search and navigation agree. */
export function storeShowHeadless(db: Database, show: boolean): void {
  writeKv(db, SHOW_HEADLESS, show ? "1" : "0");
}

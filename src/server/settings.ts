// Settings kept in the DB's kv table, so they survive restarts from the SessionStart hook
// (which starts the server without options).
import type { Database } from "bun:sqlite";
import { isSummaryLang, type SummaryLang } from "../shared/summaryLang.ts";
import { readKv, writeKv } from "./db/kv.ts";

const SUMMARY_LANG = "summary_lang";
// Named for when the one toggle showed every headless run; kept so the stored choice carries over
const SHOW_TRIALS = "show_headless";

/** The language chosen in the UI for summaries, or null if it was never set. */
export function storedSummaryLang(db: Database): SummaryLang | null {
  const v = readKv(db, SUMMARY_LANG);
  return isSummaryLang(v) ? v : null;
}

/** Saves the UI's summary language so it outlives restarts. */
export function storeSummaryLang(db: Database, lang: SummaryLang): void {
  writeKv(db, SUMMARY_LANG, lang);
}

/** Whether the calendar also shows trial runs (headless probes and checks). Off until turned on. */
export function storedShowTrials(db: Database): boolean {
  return readKv(db, SHOW_TRIALS) === "1";
}

/** Saves whether trial runs are shown. A server setting, so search and navigation agree. */
export function storeShowTrials(db: Database, show: boolean): void {
  writeKv(db, SHOW_TRIALS, show ? "1" : "0");
}

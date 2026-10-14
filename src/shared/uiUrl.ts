// The UI's URL query contract for the parts the CLI links to. The CLI writes these links and the
// web app reads them back, so both sides build and read the parameters through this module.
import { isoDay } from "./dates.ts";

/** Query parameter names the CLI and the web app share. */
export const UI_PARAMS = {
  /** Period length (`month`, `day`; week when absent). */
  view: "view",
  /** Shown day as `YYYY-MM-DD` (today when absent). */
  date: "date",
  /** Session whose drawer is open. */
  session: "session",
  /** Start (ms) of the selected section in that session; only meaningful with `session`. */
  at: "at",
} as const;

/** The `view` value that shows a single day. */
export const DAY_VIEW = "day";

/** A session (and optionally one of its sections) selected in the UI. */
export interface SessionTarget {
  session: string | null;
  /** Start of the selected section. null means the whole session. */
  at: number | null;
}

/** Writes the selected session and section; `at` is left out without a session or when 0. */
export function writeSessionTarget(target: SessionTarget, q: URLSearchParams): void {
  if (target.session) q.set(UI_PARAMS.session, target.session);
  if (target.session && target.at) q.set(UI_PARAMS.at, String(target.at));
}

/** Reads the selected session and section; a missing or non-numeric `at` is null. */
export function readSessionTarget(q: URLSearchParams): SessionTarget {
  return { session: q.get(UI_PARAMS.session), at: Number(q.get(UI_PARAMS.at)) || null };
}

/** What a CLI link opens: a day in the day view, and optionally a session's drawer at a section. */
export interface UiLinkTarget {
  /** Any time in the day to show (its local date is used). */
  day?: number;
  session?: string;
  /** Start of the section to select in the session. */
  start?: number;
}

/** The query of a link that opens the target; empty when the target is empty. */
export function uiLinkQuery(target: UiLinkTarget): URLSearchParams {
  const q = new URLSearchParams();
  if (target.day !== undefined) {
    q.set(UI_PARAMS.view, DAY_VIEW);
    q.set(UI_PARAMS.date, isoDay(target.day));
  }
  writeSessionTarget({ session: target.session ?? null, at: target.start ?? null }, q);
  return q;
}

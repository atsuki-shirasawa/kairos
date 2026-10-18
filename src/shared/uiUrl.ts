// The UI's URL contract for the parts other layers use. The CLI writes links, the server answers
// the UI's paths with the app, and the web app reads both back, so all of them build and read
// paths and parameters through this module.
import { isoDay } from "./dates.ts";

/**
 * The UI's places: Today, the Journal, which shows a period around a day, and a thread, the
 * sessions behind one piece of work.
 */
export const UI_PATHS = { today: "/today", journal: "/journal", thread: "/thread" } as const;

/** One of the UI's places, by its name in `UI_PATHS`. */
export type UiPlace = keyof typeof UI_PATHS;

/** Query parameter names the CLI and the web app share. */
export const UI_PARAMS = {
  /** Period length (`month`, `day`; week when absent). */
  view: "view",
  /** Session whose drawer is open. */
  session: "session",
  /** Start (ms) of the selected section in that session; only meaningful with `session`. */
  at: "at",
} as const;

/** The `view` value that shows a single day. */
export const DAY_VIEW = "day";

/** A page of the UI, as its path names it. */
export type UiPage =
  | { page: "today" }
  | {
      page: "journal";
      /** The shown day as written (`YYYY-MM-DD`, not checked as a date); null for today. */
      date: string | null;
    }
  | {
      page: "thread";
      /** The session the thread was opened from. */
      session: string;
    };

const TODAY_PATH = new RegExp(`^${UI_PATHS.today}/?$`);
const JOURNAL_PATH = new RegExp(`^${UI_PATHS.journal}(?:/(\\d{4}-\\d{2}-\\d{2}))?/?$`);
const THREAD_PATH = new RegExp(`^${UI_PATHS.thread}/([^/]+)/?$`);

/** The page a path names, or null for any other path (the root among them). */
export function readUiPath(pathname: string): UiPage | null {
  if (TODAY_PATH.test(pathname)) return { page: "today" };
  const journal = JOURNAL_PATH.exec(pathname);
  if (journal) return { page: "journal", date: journal[1] ?? null };
  const session = threadSession(pathname);
  return session ? { page: "thread", session } : null;
}

/** The session a thread's path names, or null when it names none (or can't be decoded). */
function threadSession(pathname: string): string | null {
  const encoded = THREAD_PATH.exec(pathname)?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** The path of the thread opened from a session (`/thread/<session>`). */
export function threadPath(session: string): string {
  return `${UI_PATHS.thread}/${encodeURIComponent(session)}`;
}

/** The Journal's path at a day (`/journal/2026-10-01`), or at today without one. */
export function journalPath(day: number | null): string {
  return day === null ? UI_PATHS.journal : `${UI_PATHS.journal}/${isoDay(day)}`;
}

/** A path with its query, leaving out an empty one. */
export function withQuery(path: string, q: URLSearchParams): string {
  return q.size ? `${path}?${q}` : path;
}

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

/**
 * The path and query of a link that opens the target: its day in the Journal's day view, or a
 * session's drawer over Today when no day is given; the app's root for an empty target.
 */
export function uiLinkPath(target: UiLinkTarget): string {
  const q = new URLSearchParams();
  if (target.day !== undefined) q.set(UI_PARAMS.view, DAY_VIEW);
  writeSessionTarget({ session: target.session ?? null, at: target.start ?? null }, q);
  if (target.day !== undefined) return withQuery(journalPath(target.day), q);
  return q.size ? withQuery(UI_PATHS.today, q) : "/";
}

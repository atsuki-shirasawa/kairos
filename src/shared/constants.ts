import { MINUTE } from "./dates.ts";

/** Local port Kairos listens on. Also used by the SessionStart hook to check that it is running. */
export const PORT = 4319;
/** The server binds only to loopback, so the logs are never reachable from the network. */
export const HOST = "127.0.0.1";
/** Names accepted in the Host header. Anything else is rejected, to defend against DNS rebinding. */
export const ALLOWED_HOSTS = ["127.0.0.1", "localhost"] as const;
/** A PR link may be recorded a little after the PR is created, so a work block's output includes this much time after its end. */
export const ARTIFACT_GRACE_MS = 5 * MINUTE;
/**
 * An open item open this many weeks or more counts as long-standing: the summary view folds it
 * away, and a recap says how long it has been open.
 */
export const OPEN_ITEM_OLD_WEEKS = 4;

/** Shortest search query (in characters) that is run; shorter ones match nearly everything. */
export const MIN_SEARCH_CHARS = 2;

/** How far back the live page's per-hour rates look: long enough to span a few requests. */
export const LIVE_RATE_WINDOW_MS = 15 * MINUTE;
/** Width of one step in the live page's token chart, which covers today from local midnight. */
export const TOKEN_BUCKET_MS = 5 * MINUTE;

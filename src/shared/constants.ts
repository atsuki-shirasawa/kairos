/** Local port Kairos listens on. Also used by the SessionStart hook to check that it is running. */
export const PORT = 4319;
/** The server binds only to loopback, so the logs are never reachable from the network. */
export const HOST = "127.0.0.1";
/** Names accepted in the Host header. Anything else is rejected, to defend against DNS rebinding. */
export const ALLOWED_HOSTS = ["127.0.0.1", "localhost"] as const;
/** A PR link may be recorded a little after the PR is created, so a work block's output includes this much time after its end. */
export const ARTIFACT_GRACE_MS = 5 * 60_000;
/**
 * An open item open this many weeks or more counts as long-standing: the summary view folds it
 * away, and a recap says how long it has been open.
 */
export const OPEN_ITEM_OLD_WEEKS = 4;

/** How far back the live page's per-hour spend looks: long enough to span a few requests. */
export const LIVE_RATE_WINDOW_MS = 15 * 60_000;
/** Width of one bar in the live page's spend band. */
export const SPEND_BUCKET_MS = 10 * 60_000;
/** Bars in the spend band: the last three hours. */
export const SPEND_BUCKETS = 18;

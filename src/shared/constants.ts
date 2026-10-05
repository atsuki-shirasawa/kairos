/** Local port Kairos listens on. Also used by the SessionStart hook to check that it is running. */
export const PORT = 4319;
export const HOST = "127.0.0.1";
/** Names accepted in the Host header. Anything else is rejected, to defend against DNS rebinding. */
export const ALLOWED_HOSTS = ["127.0.0.1", "localhost"] as const;
/** A PR link may be recorded a little after the PR is created, so a work block's output includes this much time after its end. */
export const ARTIFACT_GRACE_MS = 5 * 60_000;

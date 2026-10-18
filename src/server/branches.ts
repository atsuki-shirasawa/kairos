// Branches that say nothing about which work a session or a turn belongs to. Ingest leaves them
// out of a turn's topic keys and threads don't tie sessions through them, so both agree on them.

/**
 * Branches a whole project works on, so every piece of work passes through them. "HEAD" is a
 * detached checkout. A project's own long-lived branch under another name isn't known here.
 */
export const SHARED_BRANCHES: readonly string[] = [
  "main",
  "master",
  "develop",
  "development",
  "HEAD",
];

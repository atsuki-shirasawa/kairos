import { homedir } from "node:os";
import { join } from "node:path";

/** Claude Code config directory. Session logs live in `<claudeDir>/projects`. */
export const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

/**
 * Kairos data directory (DB, PID, and the working directory for summaries).
 * Override with `KAIROS_DATA_DIR` (for tests, or to try a different DB).
 */
export const DATA_DIR =
  process.env.KAIROS_DATA_DIR ?? join(homedir(), "Library", "Application Support", "kairos");

/**
 * Working directory of the `claude -p` runs that write summaries. They are not saved, but a
 * session launched here would be Kairos's own, so the read queries never show one.
 */
export const SUMMARIZER_CWD = join(DATA_DIR, "summarizer");

/** SQLite database used when `--db` is not given. */
export const DEFAULT_DB_PATH = join(DATA_DIR, "kairos.db");

/** Name of the file in a data directory that holds the plan's usage limits. */
export const PLAN_LIMITS_FILE = "plan-limits.json";

/** The plan's usage limits as `kairos statusline` last saw them; the server reads them from here. */
export const PLAN_LIMITS_PATH = join(DATA_DIR, PLAN_LIMITS_FILE);

/** PID of the running server. */
export const PID_PATH = join(DATA_DIR, "kairos.pid");

/** Log of the background server. Placed inside the data directory when that is overridden. */
export const LOG_PATH = process.env.KAIROS_DATA_DIR
  ? join(DATA_DIR, "server.log")
  : join(homedir(), "Library", "Logs", "kairos", "server.log");

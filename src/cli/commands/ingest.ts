// `kairos ingest`, and the log scan the other DB commands run first when no server keeps the DB
// current. The DB and ingester modules are imported lazily, as in every command.
import type { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { join } from "node:path";
import type { Ingester } from "../../server/ingest/ingester.ts";
import {
  DEFAULT_HIDDEN_CWDS,
  DEFAULT_SHOWN_RUNS,
  visibleSessionSql,
} from "../../server/visibility.ts";
import type { CliContext } from "../args.ts";

/** What one scan of the logs did. */
type ScanStats = ReturnType<Ingester["scan"]>;

/** Least time between two progress redraws, so a fast scan doesn't flood the terminal. */
const PROGRESS_EVERY_MS = 100;

/** Row counts `kairos ingest` reports after a scan. */
export interface DbCounts {
  sessions: number;
  /** Sessions with a prompt, the ones the calendar shows. */
  onCalendar: number;
  messages: number;
  artifacts: number;
}

/** Reads new and changed log files into the DB, showing progress on a terminal. */
export function scanLogs(ingester: Ingester): ScanStats {
  const tty = process.stderr.isTTY;
  let last = 0;
  const stats = ingester.scan((done, total) => {
    const now = performance.now();
    if (tty && (now - last > PROGRESS_EVERY_MS || done === total)) {
      process.stderr.write(`\rIngesting… ${done}/${total} files`);
      last = now;
    }
  });
  if (tty) process.stderr.write("\n");
  return stats;
}

/** Catches up on the logs when no server is doing it, so a command run while it's stopped sees recent work. */
export async function catchUp(
  db: Database,
  claudeDir: string,
  serverRunning: boolean,
): Promise<void> {
  if (serverRunning) return;
  const { Ingester } = await import("../../server/ingest/ingester.ts");
  scanLogs(new Ingester(db, join(claudeDir, "projects")));
}

/** How many sessions, messages and artifacts the DB holds. */
function countRows(db: Database): DbCounts {
  const n = (sql: string) => db.query<{ n: number }, []>(sql).get()?.n ?? 0;
  return {
    sessions: n("SELECT COUNT(*) AS n FROM sessions"),
    // The calendar's default: a person's sessions and automation runs, never Kairos's own runs
    onCalendar: n(
      `SELECT COUNT(*) AS n FROM sessions s
       WHERE ${visibleSessionSql({ runs: DEFAULT_SHOWN_RUNS, hiddenCwds: DEFAULT_HIDDEN_CWDS })}`,
    ),
    messages: n("SELECT COUNT(*) AS n FROM messages"),
    artifacts: n("SELECT COUNT(*) AS n FROM artifacts"),
  };
}

/** The summary `kairos ingest` prints: what the scan read, what the DB holds and how big it is. */
export function formatIngest(
  stats: Pick<ScanStats, "files" | "changed" | "ms">,
  counts: DbCounts,
  db: { path: string; bytes: number },
): string {
  return [
    `Files ${stats.files} (changed ${stats.changed}) in ${(stats.ms / 1000).toFixed(1)}s`,
    `Sessions ${counts.sessions} (on the calendar ${counts.onCalendar})`,
    `Messages ${counts.messages.toLocaleString("en-US")}, artifacts ${counts.artifacts}`,
    `DB ${(db.bytes / 1024 / 1024).toFixed(1)} MB (${db.path})`,
  ].join("\n");
}

/** `kairos ingest`: imports the session logs into the DB and says what it holds now. */
export async function ingestCommand(ctx: CliContext): Promise<undefined> {
  const { openDb } = await import("../../server/db/index.ts");
  const { Ingester } = await import("../../server/ingest/ingester.ts");
  const db = openDb(ctx.dbPath);
  const stats = scanLogs(new Ingester(db, join(ctx.claudeDir, "projects")));
  // Folds the WAL into the file first, so the size printed is the DB's real size
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  const bytes = statSync(ctx.dbPath).size;
  console.log(formatIngest(stats, countRows(db), { path: ctx.dbPath, bytes }));
  db.close();
}

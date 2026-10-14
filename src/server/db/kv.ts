// The kv table holds small server-wide values (settings, the derived-data version) as strings,
// so one pair of helpers reads and writes every key the same way.
import type { Database } from "bun:sqlite";

/** The value stored under `key`, or undefined if it was never written. */
export function readKv(db: Database, key: string): string | undefined {
  return db.query<{ value: string }, [string]>("SELECT value FROM kv WHERE key = ?").get(key)
    ?.value;
}

/** Stores `value` under `key`, replacing what was there. */
export function writeKv(db: Database, key: string, value: string): void {
  db.query(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

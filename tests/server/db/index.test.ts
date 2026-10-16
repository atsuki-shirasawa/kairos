import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, openDb, SCHEMA_VERSION } from "../../../src/server/db/index.ts";

/** Names of the indexes on a table. */
function indexes(db: Database, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA index_list(${table})`)
    .all()
    .map((r) => r.name);
}

test("a fresh DB has every migration applied", () => {
  const db = openDb(":memory:");
  expect(db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(
    SCHEMA_VERSION,
  );
  expect(indexes(db, "messages")).toContain("messages_block");
  expect(indexes(db, "messages")).not.toContain("messages_time");
});

test("migration 12 swaps messages_time for messages_block, keeping an existing DB's messages", () => {
  const path = join(tmpdir(), `kairos-messages-block-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 11).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run(
    "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
  );
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run(
    "INSERT INTO messages (id, session_id, file_id, seq, ts, kind) VALUES ('m', 's', 1, 0, 5, 'tool_use')",
  );
  old.close();
  const upgraded = openDb(path);
  expect(upgraded.query("SELECT id, kind FROM messages").get()).toEqual({
    id: "m",
    kind: "tool_use",
  });
  expect(indexes(upgraded, "messages")).toContain("messages_block");
  expect(indexes(upgraded, "messages")).not.toContain("messages_time");
  upgraded.close();
});

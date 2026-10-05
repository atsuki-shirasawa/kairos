import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Migrations. Index + 1 is the schema version (`PRAGMA user_version`).
 * Never rewrite existing entries; append changes at the end.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE projects (
    id      INTEGER PRIMARY KEY,
    path    TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL,
    color   TEXT,
    hidden  INTEGER NOT NULL DEFAULT 0
  );

  -- Ingested files and the state for resuming reads
  CREATE TABLE ingest_state (
    id              INTEGER PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    agent_id        TEXT,
    offset          INTEGER NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 0,
    ino             INTEGER,
    parser_version  INTEGER NOT NULL,
    state           TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      INTEGER REFERENCES projects(id),
    launch_cwd      TEXT,
    label           TEXT,
    branch          TEXT,
    custom_title    TEXT,
    agent_name      TEXT,
    ai_title        TEXT,
    first_prompt    TEXT,
    away_summary    TEXT,
    continued_in    TEXT,
    started_at      INTEGER,
    ended_at        INTEGER,
    prompt_count    INTEGER NOT NULL DEFAULT 0,
    scheduled_runs  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX sessions_time ON sessions(started_at, ended_at);
  CREATE INDEX sessions_continued ON sessions(continued_in);

  CREATE TABLE subagents (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_type    TEXT,
    description   TEXT,
    tool_use_id   TEXT
  );

  -- id is the record uuid (+ block index). A continued session starts with copies of the previous session's
  -- records under the same uuids, so uniqueness is per session. Copies get is_copy = 1 and are left out of totals.
  -- seq is the order within the file (line byte offset * 16 + block index)
  CREATE TABLE messages (
    id            TEXT NOT NULL,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id      TEXT,
    file_id       INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    ts            INTEGER,
    kind          TEXT NOT NULL,
    text          TEXT,
    tool_name     TEXT,
    tool_use_id   TEXT,
    is_error      INTEGER NOT NULL DEFAULT 0,
    is_scheduled  INTEGER NOT NULL DEFAULT 0,
    is_copy       INTEGER NOT NULL DEFAULT 0,
    meta          TEXT,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX messages_order ON messages(session_id, agent_id, file_id, seq);
  CREATE INDEX messages_time ON messages(session_id, ts);

  CREATE TABLE artifacts (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    ref         TEXT NOT NULL,
    title       TEXT,
    ts          INTEGER,
    file_id     INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    is_copy     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, kind, ref)
  );

  CREATE TABLE segments (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start       INTEGER NOT NULL,
    end         INTEGER NOT NULL,
    PRIMARY KEY (session_id, start)
  );
  CREATE INDEX segments_time ON segments(start, end);

  CREATE TABLE summaries (
    session_id     TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    headline       TEXT NOT NULL,
    body           TEXT NOT NULL,
    model          TEXT NOT NULL,
    covered_until  INTEGER,
    created_at     INTEGER NOT NULL
  );
  `,
  // 2: summaries per section (work block) instead of per session
  `
  ALTER TABLE segments ADD COLUMN prompt_count INTEGER NOT NULL DEFAULT 0;
  -- Headline for short sections not summarized by the LLM (first prompt, else Claude's last reply)
  ALTER TABLE segments ADD COLUMN fallback_title TEXT;

  DROP TABLE summaries;
  CREATE TABLE summaries (
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start          INTEGER NOT NULL,
    headline       TEXT NOT NULL,
    body           TEXT NOT NULL,
    model          TEXT NOT NULL,
    covered_until  INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    PRIMARY KEY (session_id, start)
  );

  -- Small settings (derived-data version etc.)
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 3: group directories of the same git repository (other clones etc.) into one project
  `
  -- Key taken from the remote (github.com/owner/repo). Never includes credentials
  ALTER TABLE projects ADD COLUMN repo TEXT;
  CREATE UNIQUE INDEX projects_repo ON projects(repo) WHERE repo IS NOT NULL;
  `,
  // 4: token usage. One response is split into a record per block, so keep one row per message.id
  `
  CREATE TABLE usage (
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id      TEXT NOT NULL,
    agent_id        TEXT,
    file_id         INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    ts              INTEGER,
    model           TEXT NOT NULL,
    speed           TEXT,
    input           INTEGER NOT NULL,
    output          INTEGER NOT NULL,
    cache_read      INTEGER NOT NULL,
    cache_write_5m  INTEGER NOT NULL,
    cache_write_1h  INTEGER NOT NULL,
    is_copy         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, message_id)
  );
  CREATE INDEX usage_time ON usage(session_id, ts);
  `,
  // 5: response effort, and turn duration (time Claude was working)
  `
  ALTER TABLE usage ADD COLUMN effort TEXT;

  -- system/turn_duration. ts is the end of the turn. Copied into continued sessions under the same uuid
  CREATE TABLE turns (
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id           TEXT NOT NULL,
    file_id      INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    ts           INTEGER NOT NULL,
    duration_ms  INTEGER NOT NULL,
    is_copy      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX turns_time ON turns(session_id, ts);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Opens the DB and applies pending migrations. `:memory:` works too (for tests). */
export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v] ?? "");
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * マイグレーション。添字 + 1 がスキーマのバージョン（`PRAGMA user_version`）。
 * 既存の要素は書き換えず、変更は末尾に足す。
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

  -- 取り込み済みのファイルと、続きから読むための状態
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

  -- id はレコードの uuid（+ ブロック番号）。続きのセッションは前のセッションの記録を同じ uuid でコピーして
  -- 始まるため、一意性はセッション単位。コピーは is_copy = 1 にして集計から除く。
  -- seq はファイル内の順序（行のバイト位置 * 16 + ブロック番号）
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
  // 2: 要約をセッション単位からセクション（作業ブロック）単位にする
  `
  ALTER TABLE segments ADD COLUMN prompt_count INTEGER NOT NULL DEFAULT 0;
  -- LLM で要約しない短いセクションの見出し（最初の発言、なければ Claude の最後の返答）
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

  -- 小さな設定値（派生データのバージョンなど）
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 3: 同じ git リポジトリのディレクトリ（別のクローンなど）を 1 つのプロジェクトにまとめる
  `
  -- remote から取った鍵（github.com/owner/repo）。認証情報は含めない
  ALTER TABLE projects ADD COLUMN repo TEXT;
  CREATE UNIQUE INDEX projects_repo ON projects(repo) WHERE repo IS NOT NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** DB を開き、未適用のマイグレーションを当てる。`:memory:` も使える（テスト用）。 */
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

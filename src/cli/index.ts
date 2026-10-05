#!/usr/bin/env bun
import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { openDb } from "../server/db/index.ts";
import { Ingester } from "../server/ingest/ingester.ts";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH } from "../server/paths.ts";
import { serve } from "../server/serve.ts";

const USAGE = `usage: kairos <command> [options]

commands:
  serve     サーバーを起動する
  ingest    セッションログを DB に取り込む（2 回目以降は差分のみ）

options:
  --claude-dir <path>   Claude Code の設定ディレクトリ（既定: ${DEFAULT_CLAUDE_DIR}）
  --db <path>           DB ファイル（既定: ${DEFAULT_DB_PATH}）`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "claude-dir": { type: "string", default: DEFAULT_CLAUDE_DIR },
    db: { type: "string", default: DEFAULT_DB_PATH },
    help: { type: "boolean", short: "h" },
  },
});

const [command] = positionals;

switch (values.help ? undefined : command) {
  case "serve":
    serve();
    break;
  case "ingest":
    ingest(values["claude-dir"], values.db);
    break;
  default:
    console.error(USAGE);
    process.exit(command && !values.help ? 1 : 0);
}

function ingest(claudeDir: string, dbPath: string): void {
  const db = openDb(dbPath);
  const ingester = new Ingester(db, join(claudeDir, "projects"));
  const tty = process.stderr.isTTY;
  let last = 0;
  const stats = ingester.scan((done, total) => {
    const now = performance.now();
    if (tty && (now - last > 100 || done === total)) {
      process.stderr.write(`\r取り込み中… ${done}/${total} ファイル`);
      last = now;
    }
  });
  if (tty) process.stderr.write("\n");

  const n = (sql: string) => db.query<{ n: number }, []>(sql).get()?.n ?? 0;
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  const size = statSync(dbPath).size;
  console.log(
    [
      `ファイル ${stats.files}（更新 ${stats.changed}）・${(stats.ms / 1000).toFixed(1)} 秒`,
      `セッション ${n("SELECT COUNT(*) AS n FROM sessions")}（カレンダー対象 ${n("SELECT COUNT(*) AS n FROM sessions WHERE prompt_count > 0")}）`,
      `メッセージ ${n("SELECT COUNT(*) AS n FROM messages").toLocaleString("en-US")}・成果物 ${n("SELECT COUNT(*) AS n FROM artifacts")}`,
      `DB ${(size / 1024 / 1024).toFixed(1)} MB（${dbPath}）`,
    ].join("\n"),
  );
  db.close();
}

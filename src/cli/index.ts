#!/usr/bin/env bun
// `ensure` は Claude Code の起動のたびに hook から呼ばれるので、重いモジュール（サーバー・DB）は
// 使うコマンドの中でだけ読み込み、起動を速く保つ。
import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH, LOG_PATH } from "../server/paths.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { ensure, health, isAlive, readPid, stop } from "./daemon.ts";

const USAGE = `usage: kairos <command> [options]

commands:
  ensure    サーバーが動いていなければバックグラウンドで起動する（SessionStart hook 用、すぐ戻る）
  open      サーバーを起動してブラウザで開く
  status    サーバーの状態を表示する
  stop      バックグラウンドのサーバーを止める
  restart   サーバーを止めて起動し直す（Kairos を更新したあとに）
  serve     サーバーを手前で起動する（開発用）
  ingest    セッションログを DB に取り込む（2 回目以降は差分のみ）

options:
  --claude-dir <path>   Claude Code の設定ディレクトリ（既定: ${DEFAULT_CLAUDE_DIR}）
  --db <path>           DB ファイル（既定: ${DEFAULT_DB_PATH}）
  --port <n>            待ち受けるポート（既定: ${PORT}）
  --summary-model <m>   要約に使うモデル（既定: haiku）
  --no-auto-summary     要約を自動では作らない（ドロワーから頼んだときだけ作る）`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "claude-dir": { type: "string", default: DEFAULT_CLAUDE_DIR },
    db: { type: "string", default: DEFAULT_DB_PATH },
    port: { type: "string" },
    "summary-model": { type: "string" },
    "no-auto-summary": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [command] = positionals;
const port = values.port ? Number(values.port) : PORT;
const url = `http://${HOST}:${port}/`;

/** バックグラウンドのサーバーへ引き継ぐオプション。 */
function serveArgs(): string[] {
  const args: string[] = [];
  if (values["claude-dir"] !== DEFAULT_CLAUDE_DIR) args.push("--claude-dir", values["claude-dir"]);
  if (values.db !== DEFAULT_DB_PATH) args.push("--db", values.db);
  if (values.port) args.push("--port", values.port);
  if (values["summary-model"]) args.push("--summary-model", values["summary-model"]);
  if (values["no-auto-summary"]) args.push("--no-auto-summary");
  return args;
}

async function waitHealthy(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(port)) return true;
    await Bun.sleep(150);
  }
  return false;
}

switch (values.help ? undefined : command) {
  case "ensure":
    // hook の出力は Claude の文脈に入るので、何も表示しない
    await ensure(import.meta.path, serveArgs(), port);
    break;
  case "open": {
    const result = await ensure(import.meta.path, serveArgs(), port);
    if (result !== "running" && !(await waitHealthy())) {
      console.error(`サーバーが起動しませんでした。ログを確認してください: ${LOG_PATH}`);
      process.exit(1);
    }
    Bun.spawn(["open", url]);
    break;
  }
  case "status": {
    const h = await health(port);
    const pid = readPid();
    if (h) console.log(`動いています: ${url}（v${h.version}${pid ? `、pid ${pid.pid}` : ""}）`);
    else if (pid && isAlive(pid.pid))
      console.log(
        `起動中です（pid ${pid.pid}）。応答がなければログを確認してください: ${LOG_PATH}`,
      );
    else console.log("止まっています。`kairos ensure` で起動します。");
    console.log(`ログ: ${LOG_PATH}`);
    break;
  }
  case "stop":
    console.log((await stop()) ? "止めました。" : "動いていませんでした。");
    break;
  case "restart":
    await stop();
    await ensure(import.meta.path, serveArgs(), port);
    console.log(
      (await waitHealthy())
        ? `起動し直しました: ${url}`
        : `起動を確認できませんでした: ${LOG_PATH}`,
    );
    break;
  case "serve": {
    const { serve } = await import("../server/serve.ts");
    await serve({
      claudeDir: values["claude-dir"],
      dbPath: values.db,
      port,
      ...(values["summary-model"] ? { summaryModel: values["summary-model"] } : {}),
      autoSummary: !values["no-auto-summary"],
    });
    break;
  }
  case "ingest":
    await ingest(values["claude-dir"], values.db);
    break;
  default:
    console.error(USAGE);
    process.exit(command && !values.help ? 1 : 0);
}

async function ingest(claudeDir: string, dbPath: string): Promise<void> {
  const { openDb } = await import("../server/db/index.ts");
  const { Ingester } = await import("../server/ingest/ingester.ts");
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

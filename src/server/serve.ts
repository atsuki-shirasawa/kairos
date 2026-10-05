import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "hono/bun";
import { removePid, writePid } from "../cli/daemon.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { createApp } from "./api/app.ts";
import { openDb } from "./db/index.ts";
import { EventHub } from "./events.ts";
import { Ingester } from "./ingest/ingester.ts";
import { watchProjects } from "./ingest/watcher.ts";
import { DATA_DIR, DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH } from "./paths.ts";
import { runClaude } from "./summarize/claude.ts";
import { DEFAULT_MODEL, Summarizer } from "./summarize/summarizer.ts";

const WEB_DIST = join(import.meta.dir, "../../dist/web");

export interface ServeOptions {
  port?: number;
  claudeDir?: string;
  dbPath?: string;
  /** 要約に使うモデル（claude --model に渡す）。 */
  summaryModel?: string;
  /** false なら要約を自動では作らない（ドロワーから頼んだときだけ作る）。 */
  autoSummary?: boolean;
}

/**
 * サーバーを起動する。DB にあるデータですぐに応答を始め、取り込みと監視はその後ろで進める。
 */
export async function serve(opts: ServeOptions = {}): Promise<void> {
  const db = openDb(opts.dbPath ?? DEFAULT_DB_PATH);
  const events = new EventHub();
  const ingester = new Ingester(db, join(opts.claudeDir ?? DEFAULT_CLAUDE_DIR, "projects"));
  const model = opts.summaryModel ?? DEFAULT_MODEL;
  const summarizer = new Summarizer(
    db,
    (prompt) => runClaude(prompt, { model, cwd: join(DATA_DIR, "summarizer") }),
    {
      model,
      auto: opts.autoSummary ?? true,
      onUpdated: (t) =>
        events.publish({ type: "summary.updated", sessionId: t.sessionId, start: t.start }),
    },
  );
  const app = createApp({ db, events, summarizer });

  // ビルド済みの Web があれば配信する。開発中は Vite が配信し、/api だけここへプロキシされる。
  // 画面は / だけ（状態はクエリで持つ）なので、SPA 用のフォールバックは置かない。
  if (existsSync(WEB_DIST)) app.use("/*", serveStatic({ root: WEB_DIST }));

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: HOST,
      port: opts.port ?? PORT,
      fetch: app.fetch,
      idleTimeout: 0, // SSE の接続を切らない
    });
  } catch (e) {
    // 別のプロセスがポートを使っている（多くは、すでに起動している Kairos）
    console.error(`kairos: cannot listen on ${HOST}:${opts.port ?? PORT}:`, e);
    db.close();
    process.exit(1);
  }
  writePid(process.pid);
  log(`serving http://${HOST}:${server.port}/ (pid ${process.pid})`);
  if (!existsSync(WEB_DIST))
    log("画面がビルドされていません。`bun run build` を実行してください（API だけ動きます）");

  const stats = await ingester.scanAsync((done, total) =>
    events.publish({ type: "ingest.progress", done, total }),
  );
  log(`ingested ${stats.changed}/${stats.files} files in ${(stats.ms / 1000).toFixed(1)}s`);
  if (stats.sessions.size) events.publish({ type: "sessions.updated", ids: [...stats.sessions] });

  const stopWatching = watchProjects(ingester, (ids) => {
    events.publish({ type: "sessions.updated", ids });
    summarizer.poke();
  });
  summarizer.start();

  const shutdown = () => {
    stopWatching();
    summarizer.stop();
    server.stop(true);
    db.close();
    removePid(process.pid);
    log("stopped");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function log(message: string): void {
  console.log(`${new Date().toISOString()} kairos: ${message}`);
}

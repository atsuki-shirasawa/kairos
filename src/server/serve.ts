import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "hono/bun";
import { HOST, PORT } from "../shared/constants.ts";
import { createApp } from "./api/app.ts";
import { openDb } from "./db/index.ts";
import { EventHub } from "./events.ts";
import { Ingester } from "./ingest/ingester.ts";
import { watchProjects } from "./ingest/watcher.ts";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH } from "./paths.ts";

const WEB_DIST = join(import.meta.dir, "../../dist/web");

export interface ServeOptions {
  port?: number;
  claudeDir?: string;
  dbPath?: string;
}

/**
 * サーバーを起動する。DB にあるデータですぐに応答を始め、取り込みと監視はその後ろで進める。
 */
export async function serve(opts: ServeOptions = {}): Promise<void> {
  const db = openDb(opts.dbPath ?? DEFAULT_DB_PATH);
  const events = new EventHub();
  const ingester = new Ingester(db, join(opts.claudeDir ?? DEFAULT_CLAUDE_DIR, "projects"));
  const app = createApp({ db, events });

  // ビルド済みの Web があれば配信する。開発中は Vite が配信し、/api だけここへプロキシされる。
  // 画面は / だけ（状態はクエリで持つ）なので、SPA 用のフォールバックは置かない。
  if (existsSync(WEB_DIST)) app.use("/*", serveStatic({ root: WEB_DIST }));

  const server = Bun.serve({
    hostname: HOST,
    port: opts.port ?? PORT,
    fetch: app.fetch,
    idleTimeout: 0, // SSE の接続を切らない
  });
  console.log(`kairos: serving http://${HOST}:${server.port}/`);

  const stats = await ingester.scanAsync((done, total) =>
    events.publish({ type: "ingest.progress", done, total }),
  );
  console.log(
    `kairos: ingested ${stats.changed}/${stats.files} files in ${(stats.ms / 1000).toFixed(1)}s`,
  );
  if (stats.sessions.size) events.publish({ type: "sessions.updated", ids: [...stats.sessions] });

  const stopWatching = watchProjects(ingester, (ids) =>
    events.publish({ type: "sessions.updated", ids }),
  );

  const shutdown = () => {
    stopWatching();
    server.stop(true);
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

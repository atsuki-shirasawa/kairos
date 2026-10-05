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
import type { SummaryLang } from "./summarize/prompt.ts";
import { DEFAULT_MODEL, Summarizer } from "./summarize/summarizer.ts";

const WEB_DIST = join(import.meta.dir, "../../dist/web");

export interface ServeOptions {
  port?: number;
  claudeDir?: string;
  dbPath?: string;
  /** Model used for summaries (passed to claude --model). */
  summaryModel?: string;
  /** Language summaries are written in (default: English). */
  summaryLang?: SummaryLang;
  /** When false, summaries are not made automatically (only when requested from the drawer). */
  autoSummary?: boolean;
}

/**
 * Starts the server. It answers right away from what is already in the DB; ingest and watching run behind it.
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
      ...(opts.summaryLang ? { lang: opts.summaryLang } : {}),
      onUpdated: (t) =>
        events.publish({ type: "summary.updated", sessionId: t.sessionId, start: t.start }),
    },
  );
  const app = createApp({ db, events, summarizer });

  // Serve the built web app if there is one. In development Vite serves it and proxies only /api here.
  // The UI is only / (state lives in the query string), so there is no SPA fallback.
  if (existsSync(WEB_DIST)) app.use("/*", serveStatic({ root: WEB_DIST }));

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: HOST,
      port: opts.port ?? PORT,
      fetch: app.fetch,
      idleTimeout: 0, // Keep SSE connections open
    });
  } catch (e) {
    // Another process holds the port (usually a Kairos that is already running)
    console.error(`kairos: cannot listen on ${HOST}:${opts.port ?? PORT}:`, e);
    db.close();
    process.exit(1);
  }
  writePid(process.pid);
  log(`serving http://${HOST}:${server.port}/ (pid ${process.pid})`);
  if (!existsSync(WEB_DIST))
    log("web UI is not built; run `bun run build` (only the API is available)");

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

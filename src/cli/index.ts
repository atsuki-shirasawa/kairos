#!/usr/bin/env bun
// `ensure` runs from a hook every time Claude Code starts, so heavy modules (server, DB) are
// loaded only inside the commands that need them, keeping startup fast.
import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH, LOG_PATH } from "../server/paths.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { ensure, health, isAlive, readPid, stop } from "./daemon.ts";

const USAGE = `usage: kairos <command> [options]

commands:
  ensure    start the server in the background if it is not running (for the SessionStart hook; returns immediately)
  open      start the server and open it in the browser
  status    show the server status
  stop      stop the background server
  restart   stop and start the server again (after updating Kairos)
  serve     run the server in the foreground (for development)
  ingest    import session logs into the DB (incremental after the first run)

options:
  --claude-dir <path>   Claude Code config directory (default: ${DEFAULT_CLAUDE_DIR})
  --db <path>           DB file (default: ${DEFAULT_DB_PATH})
  --port <n>            port to listen on (default: ${PORT})
  --summary-model <m>   model used for summaries (default: haiku)
  --summary-lang <l>    language of summaries: en or ja (default: en)
  --no-auto-summary     do not summarize automatically (only when requested from the drawer)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "claude-dir": { type: "string", default: DEFAULT_CLAUDE_DIR },
    db: { type: "string", default: DEFAULT_DB_PATH },
    port: { type: "string" },
    "summary-model": { type: "string" },
    "summary-lang": { type: "string" },
    "no-auto-summary": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [command] = positionals;
const summaryLang = values["summary-lang"];
if (summaryLang !== undefined && summaryLang !== "en" && summaryLang !== "ja") {
  console.error(`--summary-lang must be en or ja (got: ${summaryLang})`);
  process.exit(1);
}
const port = values.port ? Number(values.port) : PORT;
const url = `http://${HOST}:${port}/`;

/** Options handed on to the background server. */
function serveArgs(): string[] {
  const args: string[] = [];
  if (values["claude-dir"] !== DEFAULT_CLAUDE_DIR) args.push("--claude-dir", values["claude-dir"]);
  if (values.db !== DEFAULT_DB_PATH) args.push("--db", values.db);
  if (values.port) args.push("--port", values.port);
  if (values["summary-model"]) args.push("--summary-model", values["summary-model"]);
  if (summaryLang) args.push("--summary-lang", summaryLang);
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
    // Hook output goes into Claude's context, so print nothing
    await ensure(import.meta.path, serveArgs(), port);
    break;
  case "open": {
    const result = await ensure(import.meta.path, serveArgs(), port);
    if (result !== "running" && !(await waitHealthy())) {
      console.error(`The server did not start. Check the log: ${LOG_PATH}`);
      process.exit(1);
    }
    Bun.spawn(["open", url]);
    break;
  }
  case "status": {
    const h = await health(port);
    const pid = readPid();
    if (h) console.log(`Running: ${url} (v${h.version}${pid ? `, pid ${pid.pid}` : ""})`);
    else if (pid && isAlive(pid.pid))
      console.log(`Starting (pid ${pid.pid}). If it does not respond, check the log: ${LOG_PATH}`);
    else console.log("Not running. Start it with `kairos ensure`.");
    console.log(`Log: ${LOG_PATH}`);
    break;
  }
  case "stop":
    console.log((await stop()) ? "Stopped." : "Was not running.");
    break;
  case "restart":
    await stop();
    await ensure(import.meta.path, serveArgs(), port);
    console.log(
      (await waitHealthy())
        ? `Restarted: ${url}`
        : `Could not confirm the server started: ${LOG_PATH}`,
    );
    break;
  case "serve": {
    const { serve } = await import("../server/serve.ts");
    await serve({
      claudeDir: values["claude-dir"],
      dbPath: values.db,
      port,
      ...(values["summary-model"] ? { summaryModel: values["summary-model"] } : {}),
      ...(summaryLang ? { summaryLang } : {}),
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
      process.stderr.write(`\rIngesting… ${done}/${total} files`);
      last = now;
    }
  });
  if (tty) process.stderr.write("\n");

  const n = (sql: string) => db.query<{ n: number }, []>(sql).get()?.n ?? 0;
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  const size = statSync(dbPath).size;
  console.log(
    [
      `Files ${stats.files} (changed ${stats.changed}) in ${(stats.ms / 1000).toFixed(1)}s`,
      `Sessions ${n("SELECT COUNT(*) AS n FROM sessions")} (on the calendar ${n("SELECT COUNT(*) AS n FROM sessions WHERE prompt_count > 0")})`,
      `Messages ${n("SELECT COUNT(*) AS n FROM messages").toLocaleString("en-US")}, artifacts ${n("SELECT COUNT(*) AS n FROM artifacts")}`,
      `DB ${(size / 1024 / 1024).toFixed(1)} MB (${dbPath})`,
    ].join("\n"),
  );
  db.close();
}

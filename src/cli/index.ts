#!/usr/bin/env bun
// `ensure` runs from a hook every time Claude Code starts, so heavy modules (server, DB) are
// loaded only inside the commands that need them, keeping startup fast.
import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DATA_DIR, DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH, LOG_PATH } from "../server/paths.ts";
import { EFFORT_LEVELS, isEffort } from "../server/summarize/claude.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { AUTO_SUMMARY_DAYS } from "../shared/sections.ts";
import { ensure, health, isAlive, readPid, serverEnv, stop } from "./daemon.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "claude-dir": { type: "string", default: DEFAULT_CLAUDE_DIR },
    db: { type: "string", default: DEFAULT_DB_PATH },
    port: { type: "string" },
    "summary-model": { type: "string" },
    "summary-lang": { type: "string" },
    "summary-effort": { type: "string" },
    "no-auto-summary": { type: "boolean" },
    since: { type: "string" },
    until: { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [command] = positionals;
const summaryLang = values["summary-lang"];
if (summaryLang !== undefined && summaryLang !== "en" && summaryLang !== "ja") {
  console.error(`--summary-lang must be en or ja (got: ${summaryLang})`);
  process.exit(1);
}
const summaryEffort = values["summary-effort"];
if (summaryEffort !== undefined && !isEffort(summaryEffort)) {
  console.error(
    `--summary-effort must be one of ${EFFORT_LEVELS.join(", ")} (got: ${summaryEffort})`,
  );
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
  if (summaryEffort) args.push("--summary-effort", summaryEffort);
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

if (values.help || command === "help" || command === undefined) {
  await printHelp(command === "help" ? positionals[1] : command);
  process.exit(0);
}

switch (command) {
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
      ...(summaryEffort ? { summaryEffort } : {}),
      autoSummary: !values["no-auto-summary"],
    });
    break;
  }
  case "ingest":
    await ingest(values["claude-dir"], values.db);
    break;
  case "summarize":
    await summarize(values.db);
    break;
  default: {
    const { overview, colorFor } = await import("./help.ts");
    console.error(`Unknown command: ${command}\n\n${overview(colorFor(process.stderr))}`);
    process.exit(1);
  }
}

/** Prints the overview, or a command's own page when one is named. */
async function printHelp(name: string | undefined): Promise<void> {
  const { commandHelp, overview, colorFor } = await import("./help.ts");
  const color = colorFor(process.stdout);
  const page = name ? commandHelp(name, color) : null;
  if (name && !page) {
    // Same as an unknown command itself: a typo in a script should fail, not print the overview
    console.error(`Unknown command: ${name}\n\n${overview(colorFor(process.stderr))}`);
    process.exit(1);
  }
  console.log(page ?? overview(color));
}

async function ingest(claudeDir: string, dbPath: string): Promise<void> {
  const { openDb } = await import("../server/db/index.ts");
  const { Ingester } = await import("../server/ingest/ingester.ts");
  const db = openDb(dbPath);
  const stats = scanLogs(new Ingester(db, join(claudeDir, "projects")));

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

/** Reads new and changed log files into the DB, showing progress on a terminal. */
function scanLogs(
  ingester: import("../server/ingest/ingester.ts").Ingester,
): ReturnType<import("../server/ingest/ingester.ts").Ingester["scan"]> {
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
  return stats;
}

/** Local midnight of a `YYYY-MM-DD` day, shifted by `addDays`; exits on a malformed date. */
function dayStart(option: string, value: string, addDays = 0): number {
  const [y, mo, d] = (/^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? []).slice(1).map(Number);
  const date = y && mo && d ? new Date(y, mo - 1, d) : null;
  // Date rolls 2026-13-01 over into the next year instead of failing, so check it came back as given
  if (!date || date.getMonth() !== (mo ?? 0) - 1 || date.getDate() !== d) {
    console.error(`--${option} must be a date like 2026-08-01 (got: ${value})`);
    process.exit(1);
  }
  date.setDate(date.getDate() + addDays);
  return date.getTime();
}

/**
 * Drops control characters. Headlines are LLM output over log text, so a prompt injection could
 * make one carry escape sequences (OSC 52 clipboard writes, fake hyperlinks) into the terminal.
 */
function printable(text: string): string {
  return Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? " " : ch;
  }).join("");
}

/** `YYYY-MM-DD HH:MM` in local time, for progress lines. */
function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Which blocks `kairos summarize` covers, from `--since` / `--until` / `--limit`. */
function summarizeFilter(): import("../server/summarize/store.ts").TargetFilter {
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    console.error(`--limit must be a positive integer (got: ${values.limit})`);
    process.exit(1);
  }
  const since = values.since ? dayStart("since", values.since) : undefined;
  const until = values.until ? dayStart("until", values.until, 1) : undefined;
  if (since !== undefined && until !== undefined && until <= since) {
    console.error(`--until (${values.until}) is before --since (${values.since})`);
    process.exit(1);
  }
  return {
    ...(since !== undefined ? { startFrom: since } : {}),
    // --until names the last day to include, so stop at the following midnight
    ...(until !== undefined ? { startBefore: until } : {}),
    ...(limit ? { limit } : {}),
  };
}

async function summarize(dbPath: string): Promise<void> {
  const { openDb } = await import("../server/db/index.ts");
  const { findTargets } = await import("../server/summarize/store.ts");
  type NamedTarget = import("../server/summarize/store.ts").NamedTarget;
  const filter = summarizeFilter();
  const db = openDb(dbPath);
  const server = await health(port);
  if (!server) {
    // Without the server nothing has read the logs since it stopped, so catch up first
    const { Ingester } = await import("../server/ingest/ingester.ts");
    scanLogs(new Ingester(db, join(values["claude-dir"], "projects")));
  }
  const now = Date.now();
  // The running server is summarizing these itself; taking them too would run claude -p twice
  const leftToServer = server?.autoSummary ? now - AUTO_SUMMARY_DAYS * 24 * 60 * 60_000 : undefined;
  const targets = findTargets(db, now, {
    ...filter,
    ...(leftToServer !== undefined ? { endedBefore: leftToServer } : {}),
  });
  if (leftToServer !== undefined)
    console.log(
      `Kairos is running, so blocks from the last ${AUTO_SUMMARY_DAYS} days are left to its own summaries.`,
    );
  if (targets.length === 0) {
    const narrowed = values.since || values.until || leftToServer !== undefined;
    console.log(
      narrowed
        ? "No block in that range is waiting for a summary."
        : "Every finished block already has a summary.",
    );
    db.close();
    return;
  }
  const titles = targets.filter((t) => t.mode === "title").length;
  const oldest = formatTime(Math.min(...targets.map((t) => t.start))).slice(0, 10);
  const newest = formatTime(Math.max(...targets.map((t) => t.start))).slice(0, 10);
  console.log(
    `${targets.length} blocks without a summary (${oldest} – ${newest}): ` +
      `${targets.length - titles} full summaries, ${titles} headlines only`,
  );
  if (values["dry-run"]) {
    db.close();
    return;
  }

  const { backfill } = await import("../server/summarize/backfill.ts");
  const { runClaude } = await import("../server/summarize/claude.ts");
  const { DEFAULT_MODEL, Summarizer } = await import("../server/summarize/summarizer.ts");
  const model = values["summary-model"] ?? DEFAULT_MODEL;
  const cwd = join(DATA_DIR, "summarizer");
  // This may run inside a Claude Code session (e.g. via `!`), whose variables must not reach claude -p
  const env = serverEnv();
  // Checked at startup, but the narrowing doesn't reach into this function
  const effort = summaryEffort && isEffort(summaryEffort) ? { effort: summaryEffort } : {};
  const summarizer = new Summarizer(
    db,
    (prompt) => runClaude(prompt, { model, cwd, env, ...effort }),
    {
      model,
      quiet: true,
      // Checked at startup, but the narrowing doesn't reach into this function
      ...(summaryLang === "en" || summaryLang === "ja" ? { lang: summaryLang } : {}),
    },
  );
  const { colorFor } = await import("./help.ts");
  const { formatDuration, StatusBar } = await import("./progress.ts");
  const started = performance.now();
  const bar = new StatusBar(process.stdout, targets.length, colorFor(process.stdout));
  const where = (t: NamedTarget) => `${formatTime(t.start)}  ${printable(t.project ?? "-")}`;
  process.once("SIGINT", () => {
    bar.close();
    console.log("Interrupted. What was summarized is saved; run it again to do the rest.");
    process.exit(130);
  });
  const width = String(targets.length).length;
  const result = await backfill(db, summarizer, targets, {
    onStart: (t) => bar.begin(where(t)),
    onProgress: (p) => {
      bar.log(
        `[${String(p.index).padStart(width)}/${p.total}] ${p.status.padEnd(7)} ` +
          `${where(p.target)}  ${printable(p.detail ?? "")}`,
      );
      bar.advance(p.status === "failed");
    },
  });
  bar.close();
  db.close();

  const c = result.counts;
  console.log(
    `Done in ${formatDuration(performance.now() - started)}: ${c.summary} summarized, ` +
      `${c.title} headline only, ${c.skipped} skipped, ${c.failed} failed`,
  );
  if (result.abortedBy) {
    console.error(`Stopped after repeated failures: ${result.abortedBy}`);
    process.exit(1);
  }
  if (server) console.log("Reload Kairos in the browser to see the new summaries.");
}

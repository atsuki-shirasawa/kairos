#!/usr/bin/env bun
// `ensure` runs from a hook every time Claude Code starts, so heavy modules (server, DB) are
// loaded only inside the commands that need them, keeping startup fast.
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH, LOG_PATH, SUMMARIZER_CWD } from "../server/paths.ts";
import { EFFORT_LEVELS, isEffort } from "../server/summarize/claude.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { DAY, startOfDay } from "../shared/dates.ts";
import { isProjectShown } from "../shared/projects.ts";
import { AUTO_SUMMARY_DAYS } from "../shared/sections.ts";
import { isSummaryLang } from "../shared/summaryLang.ts";
import { ensure, health, isAlive, readPid, serverEnv, stop } from "./daemon.ts";
import { formatTime, parseDay, printable, uiLink } from "./format.ts";
import { colorFor, styles } from "./style.ts";

/** Every option any command takes; which command takes which is listed in `help.ts`. */
const OPTIONS = {
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
  full: { type: "boolean" },
  json: { type: "boolean" },
  project: { type: "string" },
  session: { type: "string" },
  follow: { type: "boolean", short: "f" },
  lines: { type: "string", short: "n" },
  help: { type: "boolean", short: "h" },
} as const;

/**
 * The options that choose how the server runs; given to `restart`, they replace the kept ones.
 * `--port` isn't one: it is never kept, only says where the server is (see `withoutPort`).
 */
const SERVER_FLAGS = new Set([
  "claude-dir",
  "db",
  "summary-model",
  "summary-lang",
  "summary-effort",
  "no-auto-summary",
]);

const { positionals, values, tokens } = parseCommandLine();
const [command, ...rest] = positionals;
if (values.help || command === "help" || command === undefined) {
  await printHelp(command === "help" ? rest[0] : command);
  process.exit(0);
}
await checkUsage(command);

const summaryLang = values["summary-lang"];
if (summaryLang !== undefined && !isSummaryLang(summaryLang)) {
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
/** The Kairos repository this command runs from; `rebuild` and `doctor` look at its sources. */
const REPO = join(import.meta.dir, "../..");
const port = values.port ? positiveInt("port", values.port) : PORT;
const url = urlOf(port);

/** Parses the command line; a malformed one (an unknown flag, a missing value) exits with a short message. */
function parseCommandLine() {
  try {
    return parseArgs({ allowPositionals: true, tokens: true, options: OPTIONS });
  } catch (e) {
    // Node's message goes on to explain `--` for positionals that start with "-"; the first sentence is enough
    const reason = (e as Error).message.split(". ")[0] ?? "Invalid arguments";
    const first = process.argv.slice(2).find((a) => !a.startsWith("-"));
    usageError(reason, first);
  }
}

/** Exits with an argument error and where to find the right usage. */
function usageError(reason: string, name: string | undefined): never {
  console.error(
    `${reason}\nRun \`kairos help${name ? ` ${name}` : ""}\` to see ${name ? "its" : "the"} options.`,
  );
  process.exit(1);
}

/**
 * Rejects options and arguments the command doesn't take, so a typo or a misplaced flag fails
 * instead of being silently ignored. Loads the help table only when there is something to check,
 * which keeps `ensure` (run on every Claude Code start, with no options) fast.
 */
async function checkUsage(name: string): Promise<void> {
  const flags = tokens.flatMap((t) => (t.kind === "option" ? [t.name] : []));
  if (flags.length === 0 && rest.length === 0) return;
  const { COMMANDS } = await import("./help.ts");
  const spec = COMMANDS[name];
  if (!spec) return; // Reported as an unknown command below
  const taken = new Set(
    (spec.options ?? []).flatMap(([flag]) => /--([\w-]+)/.exec(flag)?.slice(1) ?? []),
  );
  const extra = flags.find((f) => f !== "help" && !taken.has(f));
  if (extra) usageError(`\`kairos ${name}\` doesn't take --${extra}`, name);
  if (rest.length > 0 && !spec.args) usageError(`\`kairos ${name}\` takes no arguments`, name);
}

/** A positive integer option's value; exits on anything else. */
function positiveInt(option: string, value: string): number {
  const n = Number(value);
  if (!(Number.isInteger(n) && n > 0)) {
    console.error(`--${option} must be a positive integer (got: ${value})`);
    process.exit(1);
  }
  return n;
}

/** The UI's address on a port. */
function urlOf(p: number): string {
  return `http://${HOST}:${p}/`;
}

/** Options handed on to the background server. */
function serveArgs(): string[] {
  const args: string[] = [];
  // Absolute, since `restart` may replay them later from another working directory
  if (values["claude-dir"] !== DEFAULT_CLAUDE_DIR)
    args.push("--claude-dir", resolve(values["claude-dir"]));
  if (values.db !== DEFAULT_DB_PATH) args.push("--db", resolve(values.db));
  if (values.port) args.push("--port", values.port);
  if (values["summary-model"]) args.push("--summary-model", values["summary-model"]);
  if (summaryLang) args.push("--summary-lang", summaryLang);
  if (summaryEffort) args.push("--summary-effort", summaryEffort);
  if (values["no-auto-summary"]) args.push("--no-auto-summary");
  return args;
}

async function waitHealthy(p = port, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(p)) return true;
    await Bun.sleep(150);
  }
  return false;
}

switch (command) {
  case "ensure":
    // Hook output goes into Claude's context, so print nothing
    await ensure(import.meta.path, serveArgs(), port);
    break;
  case "open": {
    const day = rest[0] === undefined ? undefined : dayArg(rest[0]);
    const result = await ensure(import.meta.path, serveArgs(), port);
    if (result !== "running" && !(await waitHealthy())) {
      console.error(`The server did not start. Check the log: ${LOG_PATH}`);
      process.exit(1);
    }
    Bun.spawn([
      "open",
      uiLink(url, {
        ...(day !== undefined ? { day } : {}),
        ...(values.session ? { session: values.session } : {}),
      }),
    ]);
    break;
  }
  case "status":
    await status();
    break;
  case "stop": {
    const { dim, ok } = styles(colorFor(process.stdout));
    console.log((await stop()) ? `${ok("✓")} Stopped.` : dim("Was not running."));
    break;
  }
  case "restart":
    await restart();
    break;
  case "rebuild":
    await buildWeb();
    await restart();
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
      args: serveArgs(),
    });
    break;
  }
  case "ingest":
    await ingest(values["claude-dir"], values.db);
    break;
  case "summarize":
    await summarize(values.db);
    break;
  case "report":
    await report();
    break;
  case "open-items":
    await openItems();
    break;
  case "search":
    await search();
    break;
  case "doctor":
    await doctor();
    break;
  case "logs":
    await logs();
    break;
  default: {
    const { overview } = await import("./help.ts");
    console.error(
      `Unknown command: ${command}\n\n${overview(colorFor(process.stderr), process.stderr.columns)}`,
    );
    process.exit(1);
  }
}

/** Prints the overview, or a command's own page when one is named. */
async function printHelp(name: string | undefined): Promise<void> {
  const { commandHelp, overview } = await import("./help.ts");
  const color = colorFor(process.stdout);
  const page = name ? commandHelp(name, color, process.stdout.columns) : null;
  if (name && !page) {
    // Same as an unknown command itself: a typo in a script should fail, not print the overview
    console.error(
      `Unknown command: ${name}\n\n${overview(colorFor(process.stderr), process.stderr.columns)}`,
    );
    process.exit(1);
  }
  console.log(page ?? overview(color, process.stdout.columns));
}

/**
 * Stops the background server and starts it again, waiting until it answers. Without server
 * options on the command line it keeps the ones the running server was started with (from the
 * PID file), so a plain `kairos restart` doesn't quietly drop e.g. `--summary-model`.
 */
async function restart(): Promise<void> {
  const explicit = tokens.some((t) => t.kind === "option" && SERVER_FLAGS.has(t.name));
  const kept = explicit ? null : withoutPort(readPid()?.args ?? []);
  const args = kept ? [...kept, ...(values.port ? ["--port", values.port] : [])] : serveArgs();
  const wasRunning = await stop();
  await ensure(import.meta.path, args, port);
  if (!(await waitHealthy())) {
    console.error(`Could not confirm the server started: ${LOG_PATH}`);
    process.exit(1);
  }
  const { dim, ok } = styles(colorFor(process.stdout));
  const options = kept?.length ? dim(` (kept options: ${kept.join(" ")})`) : "";
  console.log(`${ok("✓")} ${wasRunning ? "Restarted" : "Started"}: ${url}${options}`);
}

/**
 * `kairos status`: a dot that says at a glance whether the server is up (green), starting
 * (yellow) or down (dim), then its options and where its log is.
 */
async function status(): Promise<void> {
  const { command, dim, ok, warn } = styles(colorFor(process.stdout));
  const h = await health(port);
  const pid = readPid();
  if (h)
    console.log(
      `${ok("●")} Running: ${url} ${dim(`(v${h.version}${pid ? `, pid ${pid.pid}` : ""})`)}`,
    );
  else if (pid && isAlive(pid.pid))
    console.log(`${warn("●")} Starting (pid ${pid.pid}). If it does not respond, see the log.`);
  else console.log(`${dim("○")} Not running. Start it with ${command("kairos ensure")}.`);
  if (h && pid?.args.length) console.log(`  ${dim("Options:")} ${pid.args.join(" ")}`);
  console.log(`  ${dim("Log:")}     ${LOG_PATH}`);
}

/**
 * Server options minus `--port`. The port is never kept: every other command (and the
 * SessionStart hook's `ensure`) finds the server on the port its own command line names, so a
 * kept port would make them miss it and start a second one.
 */
function withoutPort(args: string[]): string[] {
  const i = args.indexOf("--port");
  return i < 0 ? args : [...args.slice(0, i), ...args.slice(i + 2)];
}

/**
 * Rebuilds `dist/web` with `bun run build` in the repository. Exits on failure, so a broken
 * build never replaces the running server.
 */
async function buildWeb(): Promise<void> {
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: REPO,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if ((await build.exited) !== 0) {
    console.error("The build failed; the running server was left as it is.");
    process.exit(1);
  }
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

/** A `--since` / `--until` value as local midnight; exits on anything `parseDay` doesn't read. */
function dayOption(option: string, value: string): number {
  const day = parseDay(value);
  if (day === null) {
    console.error(`--${option} must be a date like 2026-08-01, today or yesterday (got: ${value})`);
    process.exit(1);
  }
  return day;
}

/** A day given as an argument (`kairos report 2026-10-01`); exits when it isn't one. */
function dayArg(value: string): number {
  const day = parseDay(value);
  if (day === null) usageError(`Not a day: ${value} (use YYYY-MM-DD, today or yesterday)`, command);
  return day;
}

/** The period [from, to) named by `--since` / `--until`, each optional. */
function periodOptions(): { from?: number; to?: number } {
  const from = values.since ? dayOption("since", values.since) : undefined;
  // --until names the last day to include, so stop at the following midnight
  const to = values.until ? startOfDay(dayOption("until", values.until), 1) : undefined;
  if (from !== undefined && to !== undefined && to <= from) {
    console.error(`--until (${values.until}) is before --since (${values.since})`);
    process.exit(1);
  }
  return { ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) };
}

/** Which blocks `kairos summarize` covers, from `--since` / `--until` / `--limit`. */
function summarizeFilter(): import("../server/summarize/store.ts").TargetFilter {
  const limit = values.limit === undefined ? undefined : positiveInt("limit", values.limit);
  const { from, to } = periodOptions();
  return {
    ...(from !== undefined ? { startFrom: from } : {}),
    ...(to !== undefined ? { startBefore: to } : {}),
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
  await catchUp(db, server !== null);
  const now = Date.now();
  // The running server is summarizing these itself; taking them too would run claude -p twice
  const leftToServer = server?.autoSummary ? now - AUTO_SUMMARY_DAYS * DAY : undefined;
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
  const cwd = SUMMARIZER_CWD;
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
      ...(isSummaryLang(summaryLang) ? { lang: summaryLang } : {}),
    },
  );
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

/** Catches up on the logs when no server is doing it, so a command run while it's stopped sees recent work. */
async function catchUp(db: import("bun:sqlite").Database, serverRunning: boolean): Promise<void> {
  if (serverRunning) return;
  const { Ingester } = await import("../server/ingest/ingester.ts");
  scanLogs(new Ingester(db, join(values["claude-dir"], "projects")));
}

/** Opens the DB for a read-only command, after catching up on the logs if needed. */
async function openForRead() {
  const { openDb } = await import("../server/db/index.ts");
  const { Queries } = await import("../server/queries/index.ts");
  const db = openDb(values.db);
  await catchUp(db, (await health(port)) !== null);
  return { db, q: new Queries(db) };
}

/** `kairos report`: a day (default today) or `--since` / `--until`, as Markdown or JSON. */
async function report(): Promise<void> {
  if (rest.length > 1) usageError("Give at most one day", "report");
  if (rest[0] !== undefined && (values.since || values.until))
    usageError("Give a day or --since / --until, not both", "report");
  const period = periodOptions();
  const day = rest[0] !== undefined ? dayArg(rest[0]) : undefined;
  // --until alone reports that one day, like a day argument
  const to = day !== undefined ? startOfDay(day, 1) : (period.to ?? startOfDay(Date.now(), 1));
  const from = day ?? period.from ?? startOfDay(to, -1);
  if (to <= from) usageError(`--since (${values.since}) is after today`, "report");

  const { buildReport, renderReport } = await import("./views.ts");
  const { db, q } = await openForRead();
  const projects = new Map(q.projects().map((p) => [p.id, p]));
  // Items open at the period's last moment; buildReport drops the ones closed by then
  const r = buildReport(from, to, q.calendar(from, to), projects, q.openItems(to - 1, to));
  db.close();
  console.log(values.json ? JSON.stringify(r, null, 2) : renderReport(r, values.full));
}

/** The project a `--project` value names: a path inside it (`.` for here), or its name. */
function findProject(
  projects: import("../shared/api.ts").Project[],
  value: string,
): import("../shared/api.ts").Project {
  const path = value === "." || value.includes("/") ? resolve(value) : null;
  // The longest path wins, so a project nested inside another's directory is found as itself
  const match = path
    ? projects
        .filter((p) => path === p.path || path.startsWith(`${p.path}/`))
        .sort((a, b) => b.path.length - a.path.length)[0]
    : projects.find((p) => p.name.toLowerCase() === value.toLowerCase());
  if (!match) {
    console.error(`No project matches ${value}`);
    process.exit(1);
  }
  return match;
}

/** `kairos open-items`: what is still open, for every project or one. */
async function openItems(): Promise<void> {
  const { renderOpenItems } = await import("./views.ts");
  const { db, q } = await openForRead();
  const list = q.projects();
  const project = values.project ? findProject(list, values.project) : undefined;
  const projects = new Map(list.map((p) => [p.id, p]));
  const now = Date.now();
  const items = q
    .openItems(now, now + 1)
    .filter((i) => i.closedAt === null && (!project || i.projectId === project.id));
  db.close();
  if (values.json) {
    const shown = items.filter((i) => isProjectShown(projects, i.projectId));
    console.log(JSON.stringify(shown, null, 2));
  } else console.log(renderOpenItems(items, projects));
}

/** `kairos search`: work blocks matching every term, newest first, with links into the UI. */
async function search(): Promise<void> {
  const query = rest.join(" ").trim();
  if (!query) usageError("Give something to search for", "search");
  const limit = values.limit ? positiveInt("limit", values.limit) : undefined;
  const { renderSearch } = await import("./views.ts");
  const { db, q } = await openForRead();
  const projects = new Map(q.projects().map((p) => [p.id, p]));
  const { hits, more } = q.search(query, limit);
  db.close();
  const shown = hits.filter((h) => isProjectShown(projects, h.projectId));
  console.log(
    values.json
      ? JSON.stringify({ hits: shown, more }, null, 2)
      : renderSearch(shown, more, projects, url, colorFor(process.stdout)),
  );
}

/** `kairos doctor`: checks the setup; exits 1 when something is broken. */
async function doctor(): Promise<void> {
  const { renderChecks, runChecks } = await import("./doctor.ts");
  const checks = await runChecks({
    repo: REPO,
    claudeDir: values["claude-dir"],
    dbPath: values.db,
    port,
  });
  console.log(renderChecks(checks, colorFor(process.stdout)));
  if (checks.some((c) => c.level === "fail")) process.exit(1);
}

/** `kairos logs`: the end of the server log, optionally following it. */
async function logs(): Promise<void> {
  const lines = values.lines ? positiveInt("lines", values.lines) : 50;
  if (!existsSync(LOG_PATH)) {
    console.log(`No log yet at ${LOG_PATH}`);
    return;
  }
  const tail = Bun.spawn(
    ["tail", "-n", String(lines), ...(values.follow ? ["-f"] : []), LOG_PATH],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  process.exitCode = await tail.exited;
}

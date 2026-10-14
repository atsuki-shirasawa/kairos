// The commands that run, start, stop and check the server: ensure, open, status, stop, restart,
// rebuild, serve, doctor and logs. `ensure` runs on every Claude Code start, so anything heavy is
// imported inside the command that needs it.
import { existsSync } from "node:fs";
import { LOG_PATH } from "../../server/paths.ts";
import { type CliContext, dayArg } from "../args.ts";
import { ensure, health, isAlive, readPid, stop } from "../daemon.ts";
import { CliError } from "../errors.ts";
import { uiLink } from "../format.ts";
import { colorFor, styles } from "../style.ts";

/** How long `open` and `restart` wait for a started server to answer. */
const START_TIMEOUT_MS = 15_000;
/** How often they ask meanwhile. */
const POLL_MS = 150;
/** Lines `kairos logs` shows without `--lines`. */
const DEFAULT_LOG_LINES = 50;

/** Waits until the server on `port` answers, or the timeout passes; whether it answered. */
async function waitHealthy(port: number, timeoutMs = START_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(port)) return true;
    await Bun.sleep(POLL_MS);
  }
  return false;
}

/** `kairos ensure`: starts the server in the background unless it runs. */
export async function ensureCommand(ctx: CliContext): Promise<undefined> {
  // Hook output goes into Claude's context, so print nothing
  await ensure(ctx.cliPath, ctx.serveArgs, ctx.port);
}

/** `kairos open`: starts the server if needed and opens the UI on a day or a session. */
export async function openCommand(ctx: CliContext): Promise<undefined> {
  const [first] = ctx.args;
  const day = first === undefined ? undefined : dayArg(first, ctx.command);
  const result = await ensure(ctx.cliPath, ctx.serveArgs, ctx.port);
  if (result !== "running" && !(await waitHealthy(ctx.port)))
    throw new CliError(`The server did not start. Check the log: ${LOG_PATH}`);
  Bun.spawn([
    "open",
    uiLink(ctx.url, {
      ...(day !== undefined ? { day } : {}),
      ...(ctx.session ? { session: ctx.session } : {}),
    }),
  ]);
}

/**
 * `kairos status`: a dot that says at a glance whether the server is up (green), starting
 * (yellow) or down (dim), then its options and where its log is.
 */
export async function statusCommand(ctx: CliContext): Promise<undefined> {
  const { command, dim, ok, warn } = styles(colorFor(process.stdout));
  const h = await health(ctx.port);
  const pid = readPid();
  if (h)
    console.log(
      `${ok("●")} Running: ${ctx.url} ${dim(`(v${h.version}${pid ? `, pid ${pid.pid}` : ""})`)}`,
    );
  else if (pid && isAlive(pid.pid))
    console.log(`${warn("●")} Starting (pid ${pid.pid}). If it does not respond, see the log.`);
  else console.log(`${dim("○")} Not running. Start it with ${command("kairos ensure")}.`);
  if (h && pid?.args.length) console.log(`  ${dim("Options:")} ${pid.args.join(" ")}`);
  console.log(`  ${dim("Log:")}     ${LOG_PATH}`);
}

/** `kairos stop`: stops the background server. */
export async function stopCommand(): Promise<undefined> {
  const { dim, ok } = styles(colorFor(process.stdout));
  console.log((await stop()) ? `${ok("✓")} Stopped.` : dim("Was not running."));
}

/**
 * Server options minus `--port`. The port is never kept: every other command (and the
 * SessionStart hook's `ensure`) finds the server on the port its own command line names, so a
 * kept port would make them miss it and start a second one.
 */
export function withoutPort(args: readonly string[]): string[] {
  const i = args.indexOf("--port");
  return i < 0 ? [...args] : [...args.slice(0, i), ...args.slice(i + 2)];
}

/** What `restart` starts the server with, and the options it kept from the running one. */
export interface RestartArgs {
  args: string[];
  /** The running server's options, kept because none were given; null when they were replaced. */
  kept: string[] | null;
}

/**
 * The options to restart the server with. Server options on the command line replace the running
 * server's; without any, its options (from the PID file) are kept, plus `--port` when given.
 */
export function restartArgs(given: {
  /** Whether any server option was given on the command line. */
  serverOptionsGiven: boolean;
  /** The given options, as arguments for the server. */
  serveArgs: string[];
  /** `--port` as given. */
  portArg?: string;
  /**
   * Reads the options the running server was started with. Called only when they are kept, so the
   * PID file isn't read when the command line replaces them.
   */
  runningArgs: () => readonly string[];
}): RestartArgs {
  if (given.serverOptionsGiven) return { args: given.serveArgs, kept: null };
  const kept = withoutPort(given.runningArgs());
  return { args: [...kept, ...(given.portArg ? ["--port", given.portArg] : [])], kept };
}

/**
 * Stops the background server and starts it again, waiting until it answers. Without server
 * options on the command line it keeps the ones the running server was started with (from the
 * PID file), so a plain `kairos restart` doesn't quietly drop e.g. `--summary-model`.
 */
export async function restartCommand(ctx: CliContext): Promise<undefined> {
  const { args, kept } = restartArgs({
    serverOptionsGiven: ctx.serverOptionsGiven,
    serveArgs: ctx.serveArgs,
    ...(ctx.portArg ? { portArg: ctx.portArg } : {}),
    runningArgs: () => readPid()?.args ?? [],
  });
  const wasRunning = await stop();
  await ensure(ctx.cliPath, args, ctx.port);
  if (!(await waitHealthy(ctx.port)))
    throw new CliError(`Could not confirm the server started: ${LOG_PATH}`);
  const { dim, ok } = styles(colorFor(process.stdout));
  const options = kept?.length ? dim(` (kept options: ${kept.join(" ")})`) : "";
  console.log(`${ok("✓")} ${wasRunning ? "Restarted" : "Started"}: ${ctx.url}${options}`);
}

/**
 * Rebuilds `dist/web` with `bun run build` in the repository. Fails on a failed build, so a broken
 * build never replaces the running server.
 */
async function buildWeb(repo: string): Promise<void> {
  const build = Bun.spawn(["bun", "run", "build"], {
    cwd: repo,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if ((await build.exited) !== 0)
    throw new CliError("The build failed; the running server was left as it is.");
}

/** `kairos rebuild`: builds the web UI, then restarts the server on it. */
export async function rebuildCommand(ctx: CliContext): Promise<undefined> {
  await buildWeb(ctx.repo);
  await restartCommand(ctx);
}

/** `kairos serve`: runs the server in the foreground. */
export async function serveCommand(ctx: CliContext): Promise<undefined> {
  const { serve } = await import("../../server/serve.ts");
  const { model, lang, effort, auto } = ctx.summary;
  await serve({
    claudeDir: ctx.claudeDir,
    dbPath: ctx.dbPath,
    port: ctx.port,
    ...(model ? { summaryModel: model } : {}),
    ...(lang ? { summaryLang: lang } : {}),
    ...(effort ? { summaryEffort: effort } : {}),
    autoSummary: auto,
    args: ctx.serveArgs,
  });
}

/** `kairos doctor`: checks the setup; exits 1 when something is broken. */
export async function doctorCommand(ctx: CliContext): Promise<number | undefined> {
  const { renderChecks, runChecks } = await import("../doctor.ts");
  const checks = await runChecks({
    repo: ctx.repo,
    claudeDir: ctx.claudeDir,
    dbPath: ctx.dbPath,
    port: ctx.port,
  });
  console.log(renderChecks(checks, colorFor(process.stdout)));
  return checks.some((c) => c.level === "fail") ? 1 : undefined;
}

/** `kairos logs`: the end of the server log, optionally following it; exits as `tail` does. */
export async function logsCommand(ctx: CliContext): Promise<number | undefined> {
  if (!existsSync(LOG_PATH)) {
    console.log(`No log yet at ${LOG_PATH}`);
    return;
  }
  const tail = Bun.spawn(
    ["tail", "-n", String(ctx.lines ?? DEFAULT_LOG_LINES), ...(ctx.follow ? ["-f"] : []), LOG_PATH],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  return await tail.exited;
}

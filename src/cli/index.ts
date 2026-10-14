#!/usr/bin/env bun
// The `kairos` entry point: parse the command line, build the context, run the command, and turn
// errors into output and exit codes. `ensure` runs from a hook every time Claude Code starts, so
// each command's module (and the server and DB behind it) is loaded only when that command runs.
import { join } from "node:path";
import {
  buildContext,
  type CliContext,
  checkUsage,
  givenOptions,
  parseCommandLine,
} from "./args.ts";
import { CliError } from "./errors.ts";
import { colorFor } from "./style.ts";

/** A command's work; it may return an exit code other than 0. */
type Command = (ctx: CliContext) => Promise<number | undefined>;

/** Every command, loaded on demand so `ensure` doesn't pay for the others. */
const COMMANDS: Record<string, () => Promise<Command>> = {
  ensure: async () => (await import("./commands/server.ts")).ensureCommand,
  open: async () => (await import("./commands/server.ts")).openCommand,
  status: async () => (await import("./commands/server.ts")).statusCommand,
  stop: async () => (await import("./commands/server.ts")).stopCommand,
  restart: async () => (await import("./commands/server.ts")).restartCommand,
  rebuild: async () => (await import("./commands/server.ts")).rebuildCommand,
  serve: async () => (await import("./commands/server.ts")).serveCommand,
  doctor: async () => (await import("./commands/server.ts")).doctorCommand,
  logs: async () => (await import("./commands/server.ts")).logsCommand,
  ingest: async () => (await import("./commands/ingest.ts")).ingestCommand,
  summarize: async () => (await import("./commands/summarize.ts")).summarizeCommand,
  report: async () => (await import("./commands/browse.ts")).reportCommand,
  "open-items": async () => (await import("./commands/browse.ts")).openItemsCommand,
  search: async () => (await import("./commands/browse.ts")).searchCommand,
};

/** The error for a command that doesn't exist, with the overview fitted to stderr. */
async function unknownCommandError(name: string): Promise<CliError> {
  const { unknownCommand } = await import("./help.ts");
  return new CliError(unknownCommand(name, colorFor(process.stderr), process.stderr.columns));
}

/** Prints the overview, or a command's own page when one is named. */
async function printHelp(name: string | undefined): Promise<undefined> {
  const { commandHelp, overview } = await import("./help.ts");
  const color = colorFor(process.stdout);
  const page = name ? commandHelp(name, color, process.stdout.columns) : null;
  if (name && !page) throw await unknownCommandError(name);
  console.log(page ?? overview(color, process.stdout.columns));
}

/**
 * Refuses options and arguments the command doesn't take. Loads the help table only when there is
 * something to check, which keeps `ensure` (run on every Claude Code start, with no options) fast.
 */
async function checkCommandLine(
  command: string,
  given: readonly string[],
  hasArgs: boolean,
): Promise<void> {
  if (given.length === 0 && !hasArgs) return;
  const { usageOf } = await import("./help.ts");
  checkUsage(command, usageOf(command), given, hasArgs);
}

/** Runs the command line; returns the exit code when it isn't 0. */
async function main(argv: string[]): Promise<number | undefined> {
  const line = parseCommandLine(argv);
  const [command, ...args] = line.positionals;
  if (line.values.help || command === "help" || command === undefined)
    return printHelp(command === "help" ? args[0] : command);
  // A typo in the command name is the likelier mistake, so it's reported before its options
  const load = COMMANDS[command];
  if (!load) throw await unknownCommandError(command);
  await checkCommandLine(command, givenOptions(line), args.length > 0);
  const ctx = buildContext(command, line, {
    cliPath: import.meta.path,
    repo: join(import.meta.dir, "../.."),
  });
  return (await load())(ctx);
}

try {
  const code = await main(process.argv.slice(2));
  if (code) process.exit(code);
} catch (e) {
  if (!(e instanceof CliError)) throw e;
  if (e.message) console.error(e.message);
  process.exit(e.exitCode);
}

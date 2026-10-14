// Reads the command line once into a typed context: options are parsed, checked against what the
// command takes, and validated here, so commands get values they can use without checking again.
import { parseArgs } from "node:util";
import { EFFORT_LEVELS, type Effort, isEffort } from "../server/summarize/claude.ts";
import { HOST, PORT } from "../shared/constants.ts";
import { startOfDay } from "../shared/dates.ts";
import { isSummaryLang, type SummaryLang } from "../shared/summaryLang.ts";
import { CliError, UsageError } from "./errors.ts";
import { parseDay } from "./format.ts";
import type { CommandUsage } from "./help.ts";
import { KEPT_SERVER_OPTIONS, OPTIONS, type OptionName, serveArgs } from "./options.ts";

/** Parses arguments against the option registry; its return type is what the rest reads. */
function parse(argv: string[]) {
  return parseArgs({ args: argv, allowPositionals: true, tokens: true, options: OPTIONS });
}

/** The command line as parsed, before validation. */
export type CommandLine = ReturnType<typeof parse>;

/** A day given to `--since` or `--until`: local midnight, and the text it was read from. */
export interface DayOption {
  day: number;
  text: string;
}

/** The period `--since` / `--until` name, each optional; `until` is never before `since`. */
export interface PeriodOptions {
  since?: DayOption;
  until?: DayOption;
}

/** How summaries are written, from the `--summary-*` options. */
export interface SummaryOptions {
  /** `--summary-model`; the summarizer's default when absent. */
  model?: string;
  /** `--summary-lang`; the UI's language when absent. */
  lang?: SummaryLang;
  /** `--summary-effort`; the runner's default when absent. */
  effort?: Effort;
  /** False with `--no-auto-summary`. */
  auto: boolean;
}

/** Everything a command needs from the command line and where it runs, validated. */
export interface CliContext {
  /** The command's name (`report`). */
  command: string;
  /** The arguments after the command name. */
  args: readonly string[];
  claudeDir: string;
  dbPath: string;
  /** The port the server is (or will be) on. */
  port: number;
  /** `--port` as given, which `restart` hands on as is; absent when not given. */
  portArg?: string;
  /** The UI's address on `port`. */
  url: string;
  summary: SummaryOptions;
  period: PeriodOptions;
  limit?: number;
  lines?: number;
  dryRun: boolean;
  full: boolean;
  json: boolean;
  follow: boolean;
  project?: string;
  session?: string;
  /** The server options given, as arguments for the background server. */
  serveArgs: string[];
  /** Whether any option that replaces `restart`'s kept ones was given. */
  serverOptionsGiven: boolean;
  /** This CLI's entry script, which the background server is started from. */
  cliPath: string;
  /** The Kairos repository the CLI runs from; `rebuild` and `doctor` look at its sources. */
  repo: string;
}

/** Parses the command line; a malformed one (an unknown flag, a missing value) is a usage error. */
export function parseCommandLine(argv: string[]): CommandLine {
  try {
    return parse(argv);
  } catch (e) {
    // Node's message goes on to explain `--` for positionals that start with "-"; the first sentence is enough
    const reason = (e as Error).message.split(". ")[0] ?? "Invalid arguments";
    throw new UsageError(
      reason,
      argv.find((a) => !a.startsWith("-")),
    );
  }
}

/** The long names of the options given on the command line (short forms included). */
export function givenOptions(line: CommandLine): string[] {
  return line.tokens.flatMap((t) => (t.kind === "option" ? [t.name] : []));
}

/**
 * Rejects options and arguments the command doesn't take, so a typo or a misplaced flag fails
 * instead of being silently ignored. An unknown command passes; it is reported once looked up.
 */
export function checkUsage(
  name: string,
  usage: CommandUsage | null,
  given: readonly string[],
  hasArgs: boolean,
): void {
  if (!usage) return;
  const taken = new Set<string>(usage.options);
  const extra = given.find((f) => f !== "help" && !taken.has(f));
  if (extra) throw new UsageError(`\`kairos ${name}\` doesn't take --${extra}`, name);
  if (hasArgs && !usage.takesArgs)
    throw new UsageError(`\`kairos ${name}\` takes no arguments`, name);
}

/** A positive integer option's value. */
export function positiveInt(option: string, value: string): number {
  const n = Number(value);
  if (!(Number.isInteger(n) && n > 0))
    throw new CliError(`--${option} must be a positive integer (got: ${value})`);
  return n;
}

/** A `--since` / `--until` value as local midnight; anything `parseDay` doesn't read is an error. */
export function dayOption(option: string, value: string, now = Date.now()): DayOption {
  const day = parseDay(value, now);
  if (day === null)
    throw new CliError(
      `--${option} must be a date like 2026-08-01, today or yesterday (got: ${value})`,
    );
  return { day, text: value };
}

/** A day given as an argument (`kairos report 2026-10-01`) to `command`. */
export function dayArg(value: string, command: string, now = Date.now()): number {
  const day = parseDay(value, now);
  if (day === null)
    throw new UsageError(`Not a day: ${value} (use YYYY-MM-DD, today or yesterday)`, command);
  return day;
}

/** The period [from, to) the options name; `to` is the midnight after the `--until` day. */
export function periodRange(period: PeriodOptions): { from?: number; to?: number } {
  return {
    ...(period.since ? { from: period.since.day } : {}),
    // --until names the last day to include, so stop at the following midnight
    ...(period.until ? { to: startOfDay(period.until.day, 1) } : {}),
  };
}

/** `--since` / `--until`, each optional, checked to be in order. */
export function periodOptions(
  since: string | undefined,
  until: string | undefined,
  now = Date.now(),
): PeriodOptions {
  const period: PeriodOptions = {
    ...(since ? { since: dayOption("since", since, now) } : {}),
    ...(until ? { until: dayOption("until", until, now) } : {}),
  };
  const { from, to } = periodRange(period);
  if (from !== undefined && to !== undefined && to <= from)
    throw new CliError(`--until (${until}) is before --since (${since})`);
  return period;
}

/** The `--summary-*` options, with the language and effort checked against what they accept. */
export function summaryOptions(
  values: Pick<
    CommandLine["values"],
    "summary-model" | "summary-lang" | "summary-effort" | "no-auto-summary"
  >,
): SummaryOptions {
  const { "summary-model": model, "summary-lang": lang, "summary-effort": effort } = values;
  if (lang !== undefined && !isSummaryLang(lang))
    throw new CliError(`--summary-lang must be en or ja (got: ${lang})`);
  if (effort !== undefined && !isEffort(effort))
    throw new CliError(
      `--summary-effort must be one of ${EFFORT_LEVELS.join(", ")} (got: ${effort})`,
    );
  return {
    ...(model ? { model } : {}),
    ...(lang ? { lang } : {}),
    ...(effort ? { effort } : {}),
    auto: !values["no-auto-summary"],
  };
}

/** The UI's address on a port. */
export function urlOf(port: number): string {
  return `http://${HOST}:${port}/`;
}

/** Where the CLI runs from, which the context carries for the commands that need it. */
export interface CliLocation {
  cliPath: string;
  repo: string;
}

/**
 * Validates the parsed command line into the context commands run with. Options are checked in a
 * fixed order (summary options, port, then the rest), so the first problem is the one reported.
 */
export function buildContext(
  command: string,
  line: CommandLine,
  where: CliLocation,
  now = Date.now(),
): CliContext {
  const { values } = line;
  const summary = summaryOptions(values);
  const port = values.port ? positiveInt("port", values.port) : PORT;
  const limit = values.limit === undefined ? undefined : positiveInt("limit", values.limit);
  const lines = values.lines ? positiveInt("lines", values.lines) : undefined;
  const period = periodOptions(values.since, values.until, now);
  return {
    command,
    args: line.positionals.slice(1),
    claudeDir: values["claude-dir"],
    dbPath: values.db,
    port,
    ...(values.port ? { portArg: values.port } : {}),
    url: urlOf(port),
    summary,
    period,
    ...(limit !== undefined ? { limit } : {}),
    ...(lines !== undefined ? { lines } : {}),
    dryRun: values["dry-run"] === true,
    full: values.full === true,
    json: values.json === true,
    follow: values.follow === true,
    ...(values.project ? { project: values.project } : {}),
    ...(values.session ? { session: values.session } : {}),
    serveArgs: serveArgs(values),
    serverOptionsGiven: givenOptions(line).some((name) =>
      KEPT_SERVER_OPTIONS.has(name as OptionName),
    ),
    ...where,
  };
}

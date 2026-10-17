// Every option of the `kairos` command, defined once. The parser's config, the options handed on to
// the background server and the flags shown in help are all derived from this table; which command
// takes which option is listed in `help.ts`.
import { resolve } from "node:path";
import { DEFAULT_CLAUDE_DIR, DEFAULT_DB_PATH } from "../server/paths.ts";

/** How one option is read, described and passed on. */
export interface OptionSpec {
  /** Whether it takes a value. */
  readonly type: "string" | "boolean";
  /** Its one-letter form (`-n`), if it has one. */
  readonly short?: string;
  /** Its value when not given. */
  readonly default?: string;
  /** What its value is, as help shows it (`path` reads `--db <path>`). */
  readonly placeholder?: string;
  /** Its explanation in help; a command can give its own instead (see `help.ts`). */
  readonly help: string;
  /** Handed on to the background server when given, in this table's order. */
  readonly server?: true;
  /** A path, made absolute when handed on, since `restart` may replay it from another directory. */
  readonly path?: true;
}

/** Every option any command takes, in the order they are handed on to the server. */
export const OPTIONS = {
  "claude-dir": {
    type: "string",
    default: DEFAULT_CLAUDE_DIR,
    placeholder: "path",
    help: "Claude Code config directory (default: ~/.claude)",
    server: true,
    path: true,
  },
  db: {
    type: "string",
    default: DEFAULT_DB_PATH,
    placeholder: "path",
    help: "DB file (default: under the data directory)",
    server: true,
    path: true,
  },
  port: {
    type: "string",
    placeholder: "n",
    help: "port to listen on (default: 4319)",
    server: true,
  },
  "summary-model": {
    type: "string",
    placeholder: "m",
    help: "model used for summaries (default: haiku)",
    server: true,
  },
  "summary-lang": {
    type: "string",
    placeholder: "l",
    help: "language of summaries: en or ja (default: the UI's language)",
    server: true,
  },
  "summary-effort": {
    type: "string",
    placeholder: "e",
    help: "effort for summaries: low, medium, high, xhigh or max (default: low)",
    server: true,
  },
  "no-auto-summary": {
    type: "boolean",
    help: "do not summarize automatically (only when requested from the drawer)",
    server: true,
  },
  since: {
    type: "string",
    placeholder: "day",
    help: "first day of the period (YYYY-MM-DD, today or yesterday)",
  },
  until: { type: "string", placeholder: "day", help: "last day of the period (default: today)" },
  limit: { type: "string", placeholder: "n", help: "at most n hits" },
  "old-format": {
    type: "boolean",
    help: "regenerate the full summaries in the old format (no open items), oldest first",
  },
  "dry-run": {
    type: "boolean",
    help: "show how many blocks would be summarized, without running claude",
  },
  full: { type: "boolean", help: "include each block's summary under its line" },
  json: { type: "boolean", help: "print JSON instead of text" },
  project: {
    type: "string",
    placeholder: "p",
    help: "only this project: a path inside it (. for here) or its name",
  },
  session: { type: "string", placeholder: "id", help: "open this session's drawer" },
  follow: { type: "boolean", short: "f", help: "keep printing as the log grows" },
  lines: { type: "string", short: "n", placeholder: "n", help: "how many lines (default: 50)" },
  help: { type: "boolean", short: "h", help: "show this command's help" },
} as const satisfies Record<string, OptionSpec>;

/** The name of an option, as typed after `--`. */
export type OptionName = keyof typeof OPTIONS;

/** Option values as parsed: a string or a flag's presence, absent when not given. */
export type OptionValues = Partial<Record<OptionName, string | boolean>>;

/** The table as a list, keeping its order. */
function optionEntries(): [OptionName, OptionSpec][] {
  return Object.entries(OPTIONS) as [OptionName, OptionSpec][];
}

/** The options handed on to the background server, in the order `serveArgs` writes them. */
export const SERVER_OPTIONS: readonly OptionName[] = optionEntries()
  .filter(([, spec]) => spec.server)
  .map(([name]) => name);

/**
 * The server options that, given to `restart`, replace the ones the running server was started
 * with. `--port` isn't one: it is never kept, only says where the server is (see `withoutPort`).
 */
export const KEPT_SERVER_OPTIONS: ReadonlySet<OptionName> = new Set(
  SERVER_OPTIONS.filter((name) => name !== "port"),
);

/** An option as help shows it: `-n, --lines <n>`, `--db <path>`, `--json`. */
export function flagLabel(name: OptionName): string {
  const spec: OptionSpec = OPTIONS[name];
  const short = spec.short ? `-${spec.short}, ` : "";
  const value = spec.placeholder ? ` <${spec.placeholder}>` : "";
  return `${short}--${name}${value}`;
}

/** One server option as command-line words; nothing when it isn't given or keeps its default. */
function serveArg(name: OptionName, value: string | boolean | undefined): string[] {
  const spec: OptionSpec = OPTIONS[name];
  if (spec.type === "boolean") return value ? [`--${name}`] : [];
  if (typeof value !== "string" || value === (spec.default ?? "")) return [];
  return [`--${name}`, spec.path ? resolve(value) : value];
}

/** The server options given on this command line, as arguments for the background server. */
export function serveArgs(values: OptionValues): string[] {
  return SERVER_OPTIONS.flatMap((name) => serveArg(name, values[name]));
}
